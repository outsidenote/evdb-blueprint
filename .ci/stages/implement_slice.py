#!/usr/bin/env python3
"""Stage: AI code generation — fill business logic for all slices in a context.

Three paths per slice:
  SKIP:  no meaningful TODOs → deterministic strip, zero cost, instant
  FAST:  sonnet, cwd locked, slim prompt, relevant hints only, 6 turns, $0.30
  DEEP:  opus, cwd locked, full prompt, relevant hints only, 20 turns, $2.00

Slices run in parallel (SKIP first, then FAST+DEEP concurrently).
Each slice's CWD is locked to its own directory — no file conflicts.

Usage:
    python3 .ci/stages/implement_slice.py \
        --root . \
        --context Portfolio \
        --slices "addloantoportfolio,assessloanrisk" \
        --decisions /tmp/decisions.json \
        --provider anthropic
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.contracts import (
    DECISIONS, CLAUDE_STATS, CLAUDE_SUMMARY,
    slice_stats_path, slice_claude_output,
    load_json, write_json, set_output,
)
from lib.audit import emit


# ── Config ──────────────────────────────────────────────────────

AI_MODE = {"max_turns": 20, "max_budget": 5.00, "timeout_min": 15}
MAX_PARALLEL = 3  # max concurrent Claude processes
MAX_HINTS = 7


# ── Slice result ─────────────────────────────────────────────────

@dataclass
class SliceResult:
    name: str
    path: str                          # SKIP | FAST | DEEP | BLOCKED | SKIPPED
    cost: float = 0.0
    turns: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    summary: str = ""
    hints_used: list[str] = field(default_factory=list)  # record IDs of hints selected


# ── Helpers ──────────────────────────────────────────────────────

def find_slice_dir(root: Path, context: str, slice_name: str, subdir: str = "slices") -> str | None:
    parent = root / "src" / "BusinessCapabilities" / context / subdir
    if not parent.exists():
        return None
    for candidate in parent.iterdir():
        if candidate.is_dir() and candidate.name.lower() == slice_name.lower():
            return candidate.name
    return None


def find_todo_context(root: Path, context: str, slice_dir: str | None, endpoint_dir: str | None) -> tuple[str, str]:
    for subdir, dirname in [("slices", slice_dir), ("endpoints", endpoint_dir)]:
        if dirname:
            todo_path = root / "src" / "BusinessCapabilities" / context / subdir / dirname / "TODO_CONTEXT.md"
            if todo_path.exists():
                return todo_path.read_text(), str(todo_path)
    return "", ""


def resolve_slice_cwd(root: Path, context: str, slice_dir: str | None, endpoint_dir: str | None) -> Path:
    if slice_dir:
        p = root / "src" / "BusinessCapabilities" / context / "slices" / slice_dir
        if p.exists():
            return p
    if endpoint_dir:
        p = root / "src" / "BusinessCapabilities" / context / "endpoints" / endpoint_dir
        if p.exists():
            return p
    return root / "src" / "BusinessCapabilities" / context


# ── Deterministic fast-path ──────────────────────────────────────

def scan_todos(directory: Path) -> dict[str, list[str]]:
    """Scan .ts files for TODO markers. Returns {filename: [todo_lines]}."""
    todos: dict[str, list[str]] = {}
    if not directory.exists():
        return todos
    for ts_file in directory.rglob("*.ts"):
        if "TODO_CONTEXT" in ts_file.name:
            continue
        try:
            content = ts_file.read_text()
        except Exception:
            continue
        file_todos = []
        for i, line in enumerate(content.splitlines(), 1):
            if "TODO" in line and "//" in line:
                file_todos.append(f"L{i}: {line.strip()}")
        if file_todos:
            todos[str(ts_file.relative_to(directory))] = file_todos
    return todos


GENERIC_TODO_PATTERNS = [
    re.compile(r"TODO:\s*select specific fields to store", re.I),
    re.compile(r"TODO:\s*adjust .* if needed", re.I),
    re.compile(r"TODO:\s*derive from command fields", re.I),
]


def is_trivial_slice(todo_map: dict[str, list[str]]) -> bool:
    """True if slice has zero real TODOs — only generic scaffold comments."""
    if not todo_map:
        return True
    for _, todos in todo_map.items():
        for todo_line in todos:
            if not any(p.search(todo_line) for p in GENERIC_TODO_PATTERNS):
                return False
    return True


def has_spec_logic(root: Path, context: str, slice_name: str) -> bool:
    """Check if slice.json contains specifications or non-empty descriptions.

    A slice with GWT specifications needs AI to implement branching logic.
    A slice with readmodel/processor/command descriptions has business rules
    that the scaffold cannot express — AI must read the description and
    generate the correct implementation.

    Without this check, projections like PortfolioSummary get SKIPped
    because the scaffold generates a syntactically valid EXCLUDED.payload
    UPSERT with only generic TODOs — but the description says it needs
    counter increments, weighted averages, and derived ratings.
    """
    # Try both .eventmodel and .eventmodel2
    for em_dir in (".eventmodel", ".eventmodel2"):
        spec_path = root / em_dir / ".slices" / context / slice_name / "slice.json"
        if spec_path.exists():
            spec = load_json(spec_path)
            if not spec:
                continue

            # GWT specifications = branching logic
            if spec.get("specifications"):
                return True

            # Non-empty descriptions in readmodels, processors, or commands
            for section in ("readmodels", "processors", "commands"):
                for item in spec.get(section, []):
                    desc = item.get("description", "").strip()
                    if desc:
                        return True

            return False

    return False


def strip_generic_todos(directory: Path) -> int:
    """Remove generic TODO comments from .ts files. Returns files cleaned."""
    cleaned = 0
    if not directory.exists():
        return cleaned
    for ts_file in directory.rglob("*.ts"):
        if "TODO_CONTEXT" in ts_file.name or ".test." in ts_file.name:
            continue
        try:
            content = ts_file.read_text()
            original = content
            content = re.sub(r"\s*//\s*TODO:.*$", "", content, flags=re.MULTILINE)
            if content != original:
                ts_file.write_text(content)
                cleaned += 1
        except Exception:
            pass
    return cleaned


# ── Hint retrieval ───────────────────────────────────────────────

from stages.retrieve_hints import (
    retrieve as retrieve_hints, format_for_prompt,
    build_memory_index, MemoryIndex,
)

DISCOVERIES_PATH = Path("/tmp/learned-discoveries.json")


# ── Prompts ──────────────────────────────────────────────────────

def build_prompt(todo_content: str, hints: str, test_commands: list[str]) -> str:
    """Build the implementation prompt. One prompt for all slices — no FAST/DEEP split."""
    hint_block = f"\n## Relevant Hints\n{hints}\n" if hints else ""
    test_lines = "\n".join(f"  {cmd}" for cmd in test_commands) if test_commands else "  (no test files found — skip self-testing)"

    return f"""You are filling TODO placeholders in an event-sourced TypeScript codebase (eventualize-js/evdb).

## Key Conventions
- Pure handlers: commandHandler.ts NEVER imports storage, I/O, or time. Only stream.appendEvent*().
- appendEvent syntax: stream.appendEventMyEvent({{ field1, field2 }}) — plain payload, no generics.
- All relative imports use .js extension even for .ts source files.
- View state: read from stream.views.SliceStateMySlice.
- GWTS predicates: each spec branch returns a named predicate matching the spec description.
- Computed fields (timestamps, generated IDs) belong in endpoints only, never in pure handlers.
- Boundary conditions: before writing a comparison, mentally test the boundary value. If the spec says "greater than zero", ask: what happens when the value IS zero? Zero is not greater than zero, so it should be rejected. Write the predicate that rejects the boundary case.
- No leftover TODOs: every field in every appendEvent call MUST have a real value derived from the spec. Never leave empty strings or TODO comments in generated code.
- No `any` type: ESLint enforces zero warnings. Use proper types (number, string, Record&lt;string, unknown&gt;, etc.) — never `any`.
{hint_block}
## Spec & TODO Context
{todo_content}

## Instructions
1. Read each file listed under 'Files with TODOs' in the spec above.
2. Replace ALL TODO/placeholder stubs with real business logic per the spec.
   - gwts.ts: replace return false with real predicate conditions.
   - commandHandler.ts: fill branching logic, reason strings, computed values.
   - enrichment.ts: implement enrich() per Backend Prompts section.
   - projection index.ts: replace generic UPSERT with proper field-specific SQL.
   - tests: verify event fields match spec, fix test data, add edge cases.

## Test Writing Rules
- When writing test assertions for computed/derived values, add a comment above each expected value showing the step-by-step derivation using the formulas and lookup tables from the spec.
- Do NOT hardcode expected values without showing how you computed them from the spec.
- For projection.slice.test.ts: the payload must use EVENT fields (what the handler receives), not readmodel fields (what the projection stores).

## Self-Test
After filling ALL TODOs, run these tests:
{test_lines}

If any test fails:
- Read the assertion error — it shows expected vs actual values.
- The test is derived from the spec and is CORRECT. Fix your CODE to match the test.
- Make the minimal edit that aligns your implementation with the spec.
- Re-run the test to verify your fix.
- If the same test fails twice with the same error, stop — the issue may be structural.
- Do NOT modify test files (*.test.ts) to make them pass.
- Do NOT weaken validation or remove checks to satisfy tests.
- The spec is the source of truth.

Do NOT run projection.slice.test.ts (requires a database).
Do NOT read SKILL.md or any reference files. Everything you need is above.
Do NOT run evdb-diff, evdb-scaffold, or scan sessions.
Do NOT read files outside 'Files with TODOs'."""


# ── Stats extraction ─────────────────────────────────────────────

def extract_stats(json_path: Path) -> dict:
    empty = {"cost": 0, "turns": 0, "input_tokens": 0, "output_tokens": 0, "result": ""}
    try:
        lines = json_path.read_text().splitlines()
        data = json.loads(next(l for l in lines if l.strip().startswith("{")))
        u = data.get("usage", {})
        inp = u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0)
        out = u.get("output_tokens", 0)
        return {
            "cost": data.get("total_cost_usd", 0),
            "turns": data.get("num_turns", 0),
            "input_tokens": inp,
            "output_tokens": out,
            "result": str(data.get("result", ""))[:200],
        }
    except Exception:
        return empty


# ── Per-slice worker ─────────────────────────────────────────────

def process_slice(
    slice_name: str,
    root: Path,
    context: str,
    decision: dict,
    claude_path: str,
    provider: str,
    memory_index: MemoryIndex,
) -> SliceResult:
    """Process a single slice. Called from main thread or thread pool.

    Each slice operates in its own CWD (locked to slice dir) so
    multiple workers can run concurrently without file conflicts.
    """
    # ── Resolve directories ──────────────────────────────────
    slice_dir = find_slice_dir(root, context, slice_name, "slices")
    endpoint_dir = find_slice_dir(root, context, slice_name, "endpoints")
    if not slice_dir and not endpoint_dir:
        print(f"  [{slice_name}] SKIP: no directory found", file=sys.stderr)
        return SliceResult(name=slice_name, path="SKIPPED", summary=f"{slice_name}: no directory")

    todo_content, _ = find_todo_context(root, context, slice_dir, endpoint_dir)
    if not todo_content:
        print(f"  [{slice_name}] SKIP: no TODO_CONTEXT.md", file=sys.stderr)
        return SliceResult(name=slice_name, path="SKIPPED", summary=f"{slice_name}: no TODO")

    cwd = resolve_slice_cwd(root, context, slice_dir, endpoint_dir)

    # ── Deterministic fast-path ──────────────────────────────
    todo_map = scan_todos(cwd)
    spec_has_logic = has_spec_logic(root, context, slice_name)
    if is_trivial_slice(todo_map) and not spec_has_logic:
        cleaned = strip_generic_todos(cwd)
        print(f"  [{slice_name}] DETERMINISTIC: stripped {cleaned} generic TODO(s)", file=sys.stderr)
        emit("ai_skipped", "implement_slice.py", slice=slice_name, context=context,
             data={"reason": "trivial_slice", "todos_found": len(todo_map), "cleaned": cleaned})
        return SliceResult(name=slice_name, path="SKIP", summary=f"{slice_name}: deterministic (trivial)")
    if is_trivial_slice(todo_map) and spec_has_logic:
        print(f"  [{slice_name}] OVERRIDE: generic TODOs but spec has logic — sending to AI", file=sys.stderr)

    # ── Retrieve relevant hints ────────────────────────────────
    todo_files = list(todo_map.keys())
    hint_records = retrieve_hints(
        index=memory_index,
        context=context,
        slice_name=slice_name,
        todo_files=todo_files,
        max_hints=MAX_HINTS,
        mode="deep",
    )
    hints = format_for_prompt(hint_records)
    hint_count = len(hint_records)
    hint_ids = [r["id"] for r in hint_records if "id" in r]

    # ── Discover test files for self-test ────────────────────
    test_commands: list[str] = []
    for test_pattern in [
        "tests/command.slice.test.ts",
        "tests/projection.test.ts",
        "tests/enrichment.test.ts",
    ]:
        if (cwd / test_pattern).exists():
            test_commands.append(f"node --import tsx --test {test_pattern}")

    # ── Build prompt ────────────────────────────────────────
    prompt = build_prompt(todo_content, hints, test_commands)

    # Append clarification answers from prior PR comments (if any)
    answers_path = Path("/tmp/pr-clarification-answers.txt")
    if answers_path.exists():
        raw = answers_path.read_text().strip()
        if raw:
            prompt += (
                f"\n\n## Clarification from Developer\n"
                f"A previous run had questions. The developer answered in PR comments:\n\n"
                f"{raw[:3000]}\n\n"
                f"Use these answers to resolve any ambiguity in the spec.\n"
            )

    mode = AI_MODE
    print(f"  [{slice_name}] Opus | ${mode['max_budget']} "
          f"| {sum(len(v) for v in todo_map.values())} TODOs | {hint_count} hint(s) "
          f"| {len(test_commands)} self-test(s)",
          file=sys.stderr)

    # ── Run Claude Code ──────────────────────────────────────
    output_path = slice_claude_output(slice_name)

    try:
        subprocess.run(
            [claude_path, "--print", "--dangerously-skip-permissions",
             "--output-format", "json",
             "--exclude-dynamic-system-prompt-sections",
             "--max-budget-usd", str(mode["max_budget"]),
             "--max-turns", str(mode["max_turns"]),
             prompt],
            capture_output=False,
            cwd=str(cwd),
            timeout=mode["timeout_min"] * 60,
            stdout=open(output_path, "w"),
            stderr=sys.stderr,
        )
    except subprocess.TimeoutExpired:
        print(f"  [{slice_name}] TIMEOUT after {mode['timeout_min']}min", file=sys.stderr)
    except Exception as e:
        print(f"  [{slice_name}] ERROR: {e}", file=sys.stderr)

    # ── Extract stats ────────────────────────────────────────
    stats = extract_stats(output_path)
    write_json(slice_stats_path(slice_name), stats)

    emit("ai_invocation", "implement_slice.py", slice=slice_name, context=context,
         data={
             "mode": "AI",
             "model": "opus",
             "tokens_in": stats["input_tokens"],
             "tokens_out": stats["output_tokens"],
             "cost_usd": stats["cost"],
             "turns": stats["turns"],
             "max_budget_usd": mode["max_budget"],
             "max_turns": mode["max_turns"],
             "cwd": str(cwd),
             "todo_files": todo_files,
             "hint_sections": hint_count,
             "self_test_commands": len(test_commands),
             "policy_rule": decision.get("rule_matched", ""),
         })

    print(f"  [{slice_name}] Done: {stats['turns']} turns, ${stats['cost']:.2f}", file=sys.stderr)

    return SliceResult(
        name=slice_name, path="AI",
        cost=stats["cost"], turns=stats["turns"],
        input_tokens=stats["input_tokens"], output_tokens=stats["output_tokens"],
        summary=stats.get("result", ""),
        hints_used=hint_ids if stats["turns"] > 0 else [],
    )


# ── Reuse feedback ──────────────────────────────────────────────

UPDATED_DISCOVERIES_PATH = Path("/tmp/learned-discoveries.updated.json")


def _record_reuse_feedback(
    records: list[dict],
    results: list[SliceResult],
) -> None:
    """Update reuse metadata for hints that were actually used.

    Runs in the main thread after all workers complete — no shared
    mutable state. Writes to a separate artifact file so the original
    discovery file is never corrupted.

    The updated file feeds back into the learning loop:
      - learn.py's --prior-discoveries can point here
      - retrieve_hints scores +1 for times_reused > 0
      - Over time, frequently useful patterns surface higher
    """
    if not records:
        return

    # Collect hint IDs from successful AI runs only
    used_ids: set[str] = set()
    for r in results:
        if r.path == "AI" and r.turns > 0:
            used_ids.update(r.hints_used)

    if not used_ids:
        return

    now = datetime.now(timezone.utc).isoformat()
    updated_count = 0

    # Shallow-copy each record, bump reuse fields on matches
    updated_records: list[dict] = []
    for record in records:
        rec = dict(record)  # shallow copy — don't mutate originals
        if rec.get("id") in used_ids:
            rec["times_reused"] = rec.get("times_reused", 0) + 1
            rec["last_reused_at"] = now
            updated_count += 1
        updated_records.append(rec)

    artifact = {
        "memory_version": 1,
        "updated_at": now,
        "source_stage": "implement_slice.py",
        "reuse_updates": updated_count,
        "record_count": len(updated_records),
        "records": updated_records,
    }
    write_json(UPDATED_DISCOVERIES_PATH, artifact)

    print(
        f"  Reuse feedback: {updated_count} hint(s) updated → "
        f"{UPDATED_DISCOVERIES_PATH}",
        file=sys.stderr,
    )


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="AI fill business logic for slices")
    parser.add_argument("--root", default=".")
    parser.add_argument("--context", required=True)
    parser.add_argument("--slices", required=True)
    parser.add_argument("--decisions", default=str(DECISIONS))
    parser.add_argument("--provider", default="anthropic")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    context = args.context
    slice_names = [s.strip() for s in args.slices.split(",") if s.strip()]

    # Load shared data once
    decisions_data = load_json(Path(args.decisions))
    decisions_lookup = {d["slice"]: d for d in decisions_data.get("decisions", [])}

    # Load structured discoveries once, build index for fast per-slice lookup
    disc_data = load_json(DISCOVERIES_PATH)
    discoveries = disc_data.get("records", []) if isinstance(disc_data, dict) else []
    memory_index = build_memory_index(discoveries)

    claude_path = shutil.which("claude")
    if not claude_path:
        print("ERROR: claude CLI not found", file=sys.stderr)
        sys.exit(1)

    start_time = time.time()

    # ── Phase 1: Filter blocked slices ───────────────────────
    active_slices = []
    for name in slice_names:
        decision = decisions_lookup.get(name, {})
        if decision.get("action") == "block":
            print(f"\n  [{name}] BLOCKED: {decision.get('reason', '')}", file=sys.stderr)
            emit("ai_skipped", "implement_slice.py", slice=name, context=context,
                 data={"reason": "blocked_by_policy"})
        else:
            active_slices.append((name, decision))

    if not active_slices:
        print("No active slices to process", file=sys.stderr)
        write_json(CLAUDE_STATS, {"cost": 0, "turns": 0, "input_tokens": 0, "output_tokens": 0, "total_tokens": 0})
        CLAUDE_SUMMARY.write_text("")
        set_output("duration", "0m 0s")
        set_output("cost", "0")
        set_output("num_turns", "0")
        return

    # ── Phase 2: Run all slices in parallel ──────────────────
    print(f"\nProcessing {len(active_slices)} slices (max {MAX_PARALLEL} parallel)...", file=sys.stderr)

    results: list[SliceResult] = []

    with ThreadPoolExecutor(max_workers=MAX_PARALLEL) as pool:
        futures = {}
        for name, decision in active_slices:
            future = pool.submit(
                process_slice,
                slice_name=name,
                root=root,
                context=context,
                decision=decision,
                claude_path=claude_path,
                provider=args.provider,
                memory_index=memory_index,
            )
            futures[future] = name

        for future in as_completed(futures):
            name = futures[future]
            try:
                result = future.result()
                results.append(result)
            except Exception as e:
                print(f"  [{name}] EXCEPTION: {e}", file=sys.stderr)
                results.append(SliceResult(name=name, path="ERROR", summary=str(e)))

    # ── Phase 3: Aggregate ───────────────────────────────────
    totals = {
        "cost": sum(r.cost for r in results),
        "turns": sum(r.turns for r in results),
        "input_tokens": sum(r.input_tokens for r in results),
        "output_tokens": sum(r.output_tokens for r in results),
    }
    totals["total_tokens"] = totals["input_tokens"] + totals["output_tokens"]

    write_json(CLAUDE_STATS, totals)
    CLAUDE_SUMMARY.write_text(
        "\n".join(f"{r.name}: {r.summary}" for r in results if r.summary)[:1000]
    )

    # ── Phase 4: Record reuse feedback ────────────────────────
    _record_reuse_feedback(discoveries, results)

    elapsed = time.time() - start_time
    duration = f"{int(elapsed // 60)}m {int(elapsed % 60)}s"

    set_output("duration", duration)
    set_output("cost", f"{totals['cost']:.4f}")
    set_output("num_turns", str(totals["turns"]))

    # Summary
    print(f"\n{'='*50}", file=sys.stderr)
    print(f"  Summary: {len(results)} slices in {duration}", file=sys.stderr)
    for r in results:
        cost_str = f"${r.cost:.2f}" if r.cost > 0 else "$0"
        print(f"    {r.name:30s} {r.path:6s}  {r.turns:2d} turns  {cost_str}", file=sys.stderr)
    print(f"  Total: {totals['turns']} turns, ${totals['cost']:.2f}", file=sys.stderr)
    print(f"{'='*50}", file=sys.stderr)


if __name__ == "__main__":
    main()
