#!/usr/bin/env python3
"""
plan_slice.py — Generation Plan producer for the evdb compiler pipeline.

Reads a .normalized.json IR file and produces a .plan.json that describes
exactly which files will be generated, how, and what's deterministic.

This separates:
  WHAT the system understands  → .normalized.json  (IR)
  HOW code will be generated   → .plan.json         (Plan)

Before any code is written, you can inspect the plan to know exactly
what the scaffold will produce — like a compiler's intermediate pass.

Artifact modes:
  create        — generate new file; skip if already exists
  create-stub   — generate file with TODO stubs (AI must fill in)
  inject        — inject a block into an existing shared file (routes, stream factory)

Usage:
    python3 plan_slice.py <normalized.json>
    python3 plan_slice.py --all --root <repo_root>
    python3 plan_slice.py <normalized.json> --dry-run

Output: .eventmodel/.normalized/<Context>/<sliceDir>.plan.json
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


# ---------------------------------------------------------------------------
# Artifact builders
# ---------------------------------------------------------------------------

def _src(root_rel: str, context: str, *parts: str) -> str:
    """Build a src/ relative path string."""
    return "/".join(["src", "BusinessCapabilities", context] + list(parts))


def build_plan(norm: dict) -> dict:
    context = norm["slice"]["context"]
    slice_type = norm["slice"]["sliceType"]
    cmd_class = norm["naming"]["commandClassName"]
    slice_name = norm["naming"]["sliceName"]
    stream = context  # stream == context by convention
    view_name = norm["view"]["viewName"]
    has_specs = bool(norm["specifications"])
    has_given = norm["view"]["hasGivenEvents"]
    events = norm["events"]

    # Detect automation (pg-boss) vs REST: automation slices have processors.
    # We can't detect this from the IR alone without reading the raw slice.json,
    # so we default to REST and note it as a plan assumption.
    endpoint_type = "REST"
    endpoint_dir = _src("", context, "endpoints", cmd_class, "REST", "index.ts").lstrip("/")

    artifacts = []

    # ── 1. Event interfaces (one per event, deterministic) ───────────────
    for ev in events:
        ev_class = ev["className"]
        artifacts.append({
            "id": f"event.{ev_class}",
            "file": _src("", context, "swimlanes", stream, "events", f"{ev_class}.ts"),
            "generator": "gen_event_interface",
            "mode": "create",
            "deterministic": True,
            "ir_source": "events[]",
            "description": f"Event interface I{ev_class}",
        })

    # ── 2. SliceState view (only when specs exist) ───────────────────────
    if has_specs:
        view_base = _src("", context, "swimlanes", stream, "views", view_name)
        artifacts.append({
            "id": "view.state",
            "file": f"{view_base}/state.ts",
            "generator": "gen_view_state",
            "mode": "create",
            "deterministic": True,
            "ir_source": "view.stateFields + view.viewName",
            "description": f"View state type {view_name}ViewState + defaultState",
            "note": "stateFields is empty when no given events — view gets minimal 'initialized' flag" if not has_given else None,
        })
        artifacts.append({
            "id": "view.handlers",
            "file": f"{view_base}/handlers.ts",
            "generator": "gen_view_handlers",
            "mode": "create",
            "deterministic": True,
            "ir_source": "view.stateFields + events[]",
            "description": "View event handlers that accumulate state",
        })
        artifacts.append({
            "id": "view.test",
            "file": f"{view_base}/view.slice.test.ts",
            "generator": "gen_view_test",
            "mode": "create",
            "deterministic": True,
            "ir_source": "specifications[].given",
            "description": "View unit test stubs (accumulation scenarios)",
        })

    # ── 3. Command interface (deterministic) ─────────────────────────────
    slice_base = _src("", context, "slices", cmd_class)
    artifacts.append({
        "id": "command",
        "file": f"{slice_base}/command.ts",
        "generator": "gen_command",
        "mode": "create",
        "deterministic": True,
        "ir_source": "command.fields + naming.commandClassName",
        "description": f"Command interface {cmd_class} extends ICommand",
    })

    # ── 4. GWTs — stubs only, AI must fill predicate bodies ──────────────
    if has_specs:
        artifacts.append({
            "id": "gwts",
            "file": f"{slice_base}/gwts.ts",
            "generator": "gen_gwts",
            "mode": "create-stub",
            "deterministic": False,
            "ir_source": "specifications[].predicate",
            "description": "Named predicate functions — structure deterministic, bodies require AI/human",
            "unresolved": [
                {
                    "predicate_index": i,
                    "hint": spec["predicate"].get("hint"),
                    "rule": "REVIEW_REQUIRED",
                }
                for i, spec in enumerate(norm["specifications"])
            ],
        })

    # ── 5. Command handler — partial stub ────────────────────────────────
    artifacts.append({
        "id": "commandHandler",
        "file": f"{slice_base}/commandHandler.ts",
        "generator": "gen_command_handler",
        "mode": "create-stub",
        "deterministic": False,
        "ir_source": "specifications[] + command.outboundEvents",
        "description": "Command handler — branch structure deterministic, computed field values require AI/human",
        "deterministic_parts": [
            "if/else branch structure (one branch per spec)",
            "appendEvent calls for each outbound event",
            "view destructure (only when view.hasGivenEvents=true)",
        ],
        "stub_parts": [
            "computed/generated field values in appendEvent payloads",
        ],
    })

    # ── 6. Adapter (deterministic) ───────────────────────────────────────
    artifacts.append({
        "id": "adapter",
        "file": f"{slice_base}/adapter.ts",
        "generator": "gen_adapter",
        "mode": "create",
        "deterministic": True,
        "ir_source": "naming + command.fields (first UUID field for stream key)",
        "description": f"CommandHandlerOrchestrator adapter for {cmd_class}",
    })

    # ── 7. Endpoint ───────────────────────────────────────────────────────
    artifacts.append({
        "id": "endpoint",
        "file": endpoint_dir,
        "generator": f"gen_{endpoint_type.lower()}_endpoint",
        "mode": "create",
        "deterministic": True,
        "ir_source": "command.inputFields + command.generatedFields",
        "description": f"{endpoint_type} endpoint — destructures body, sets generated fields, dispatches command",
        "assumption": f"Assumed endpoint type: {endpoint_type}. Override if slice uses pg-boss automation.",
    })

    # ── 8. Command test (deterministic structure, examples from IR) ───────
    artifacts.append({
        "id": "test",
        "file": f"{slice_base}/tests/command.slice.test.ts",
        "generator": "gen_test",
        "mode": "create",
        "deterministic": True,
        "ir_source": "specifications[].when/then/given + command.fields",
        "description": "Slice unit tests using SliceTester — one test per spec + main flow",
        "note": "Test data examples come from spec field examples; generated-field dates are placeholders.",
    })

    # ── 9. Shared file injections ─────────────────────────────────────────
    injections = []

    injections.append({
        "id": "stream_factory",
        "file": _src("", context, "swimlanes", stream, "index.ts"),
        "generator": "update_stream_factory",
        "mode": "inject",
        "deterministic": True,
        "ir_source": "events[] + view.viewName",
        "description": "Register events (.withEvent) and view (.withView) in stream factory",
        "injects": (
            [f'.withEvent("{ev["className"]}").asType<I{ev["className"]}>()'
             for ev in events] +
            ([f".withView({_camel(view_name)}ViewName, {_camel(view_name)}DefaultState, {_camel(view_name)}Handlers)"]
             if has_specs else [])
        ),
    })

    if has_specs:
        injections.append({
            "id": "views_type",
            "file": _src("", context, "swimlanes", stream, f"{stream}Views.ts"),
            "generator": "update_views_type",
            "mode": "inject",
            "deterministic": True,
            "ir_source": "view.viewName",
            "description": f"Add {view_name}ViewState to {stream}Views intersection type",
        })

    if endpoint_type == "REST":
        injections.append({
            "id": "routes",
            "file": _src("", context, "endpoints", "routes.ts"),
            "generator": "update_routes",
            "mode": "inject",
            "deterministic": True,
            "ir_source": "naming.commandClassName",
            "description": f"Register POST /{_kebab(cmd_class)} route in {context} router",
        })

    # ── Summary ───────────────────────────────────────────────────────────
    total = len(artifacts) + len(injections)
    det_count = sum(1 for a in artifacts if a["deterministic"])
    stub_count = sum(1 for a in artifacts if not a["deterministic"])

    return {
        "schema_version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "ir_source": norm["source"],
        "slice": norm["naming"]["sliceName"],
        "context": context,
        "stream": stream,
        "summary": {
            "total_artifacts": total,
            "deterministic": det_count + len(injections),
            "requires_review": stub_count,
            "endpoint_type": endpoint_type,
        },
        "artifacts": artifacts,
        "injections": injections,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _camel(s: str) -> str:
    return s[0].lower() + s[1:] if s else s


def _kebab(s: str) -> str:
    import re
    s1 = re.sub(r"([A-Z])", r"-\1", s).strip("-").lower()
    return re.sub(r"-+", "-", s1)


# ---------------------------------------------------------------------------
# Output path
# ---------------------------------------------------------------------------

def plan_path_for(normalized_path: Path) -> Path:
    """Replace .normalized.json → .plan.json"""
    return normalized_path.with_name(normalized_path.name.replace(".normalized.json", ".plan.json"))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="evdb generation plan — produces .plan.json from .normalized.json"
    )
    parser.add_argument("normalized", nargs="?", help="Path to .normalized.json")
    parser.add_argument("--all", action="store_true", help="Plan all normalized files under --root")
    parser.add_argument("--root", default=".", help="Repo root (default: .)")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without writing")
    args = parser.parse_args()

    root = Path(args.root).resolve()

    if args.all:
        norm_dir = root / ".eventmodel" / ".normalized"
        if not norm_dir.exists():
            print(f"ERROR: {norm_dir} not found. Run normalize first.", file=sys.stderr)
            sys.exit(1)
        files = sorted(norm_dir.rglob("*.normalized.json"))
        if not files:
            print("No .normalized.json files found.", file=sys.stderr)
            sys.exit(1)
        errors = []
        for nf in files:
            try:
                norm = json.loads(nf.read_text())
                # Skip non-STATE_CHANGE or no-command slices gracefully
                if norm["slice"]["sliceType"] != "STATE_CHANGE" or not norm["naming"]["commandClassName"]:
                    print(f"SKIP {nf.relative_to(root)} (sliceType={norm['slice']['sliceType']})")
                    continue
                plan = build_plan(norm)
                out = plan_path_for(nf)
                if args.dry_run:
                    print(f"[dry-run] {nf.relative_to(root)} → {out.relative_to(root)}")
                else:
                    out.write_text(json.dumps(plan, indent=2))
                    print(f"OK  {out.relative_to(root)}")
            except Exception as e:
                errors.append((nf, str(e)))
                print(f"ERR {nf}: {e}", file=sys.stderr)
        if errors:
            sys.exit(1)
        return

    if not args.normalized:
        parser.print_help()
        sys.exit(1)

    nf = Path(args.normalized).resolve()
    if not nf.exists():
        print(f"ERROR: {nf} not found", file=sys.stderr)
        sys.exit(1)

    norm = json.loads(nf.read_text())
    plan = build_plan(norm)
    out = plan_path_for(nf)

    if args.dry_run:
        print(json.dumps(plan, indent=2))
        print(f"\n[dry-run] would write to: {out}", file=sys.stderr)
    else:
        out.write_text(json.dumps(plan, indent=2))
        print(f"OK  {out}")


if __name__ == "__main__":
    main()
