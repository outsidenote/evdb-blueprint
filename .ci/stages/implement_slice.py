#!/usr/bin/env python3
"""Stage: AI code generation — fill business logic for all slices in a context.

Two modes:
  FAST (sonnet): cwd locked to slice dir, slim prompt, no tests, 6 turns, $0.30
  DEEP (opus):   cwd at project root, full prompt with test loop, 20 turns, $2.00

Haiku classifies complexity when policy says model=auto.

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
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.contracts import (
    DECISIONS, CLAUDE_STATS, CLAUDE_SUMMARY, POLICY_CONFIG,
    slice_stats_path, slice_claude_output,
    load_json, load_config, write_json, set_output,
)
from lib.audit import emit


# ── Mode configs ─────────────────────────────────────────────────

FAST_MODE = {
    "max_turns": 6,
    "max_budget": 0.30,
    "timeout_min": 5,
}

DEEP_MODE = {
    "max_turns": 20,
    "max_budget": 2.00,
    "timeout_min": 20,
}


# ── Helpers ──────────────────────────────────────────────────────

def find_slice_dir(root: Path, context: str, slice_name: str, subdir: str = "slices") -> str | None:
    """Resolve lowercase slice name to actual PascalCase directory name."""
    parent = root / "src" / "BusinessCapabilities" / context / subdir
    if not parent.exists():
        return None
    for candidate in parent.iterdir():
        if candidate.is_dir() and candidate.name.lower() == slice_name.lower():
            return candidate.name
    return None


def find_todo_context(root: Path, context: str, slice_dir: str | None, endpoint_dir: str | None) -> tuple[str, str]:
    """Find TODO_CONTEXT.md content and path."""
    for subdir, dirname in [("slices", slice_dir), ("endpoints", endpoint_dir)]:
        if dirname:
            todo_path = root / "src" / "BusinessCapabilities" / context / subdir / dirname / "TODO_CONTEXT.md"
            if todo_path.exists():
                return todo_path.read_text(), str(todo_path)
    return "", ""


def find_test_cmd(root: Path, context: str, slice_dir: str | None, endpoint_dir: str | None) -> str:
    """Find the test command for this slice (deep mode only)."""
    candidates = []
    if slice_dir:
        candidates.append(f"src/BusinessCapabilities/{context}/slices/{slice_dir}/tests/command.slice.test.ts")
        candidates.append(f"src/BusinessCapabilities/{context}/slices/{slice_dir}/tests/projection.test.ts")
    if endpoint_dir:
        candidates.append(f"src/BusinessCapabilities/{context}/endpoints/{endpoint_dir}/tests/enrichment.test.ts")

    for tf in candidates:
        if (root / tf).exists():
            return f"node --import tsx --test {tf}"
    return "echo 'no test found'"


def resolve_slice_cwd(root: Path, context: str, slice_dir: str | None, endpoint_dir: str | None) -> Path:
    """Resolve the working directory for a slice.

    For fast mode: cwd = the slice/endpoint directory (hard constrained).
    Falls back to context dir if neither exists.
    """
    if slice_dir:
        p = root / "src" / "BusinessCapabilities" / context / "slices" / slice_dir
        if p.exists():
            return p
    if endpoint_dir:
        p = root / "src" / "BusinessCapabilities" / context / "endpoints" / endpoint_dir
        if p.exists():
            return p
    return root / "src" / "BusinessCapabilities" / context


# ── Prompts ──────────────────────────────────────────────────────

def build_fast_prompt(todo_content: str) -> str:
    """Slim prompt for fast mode. No conventions dump, no test loop."""
    return f"""Implement TODOs in this TypeScript slice.

{todo_content}

Tasks:
- Replace all TODO stubs in gwts.ts with real predicate logic
- Replace all TODO stubs in commandHandler.ts with real branching logic
- Replace all TODO stubs in enrichment.ts if present
- Replace generic UPSERT in projection index.ts with field-specific SQL if present

Rules:
- Only edit files listed in the spec above
- Do NOT run tests
- Do NOT read files outside this directory
- Do NOT scan or explore the repo

Return when all TODOs are replaced."""


def build_deep_prompt(todo_content: str, hints: str) -> str:
    """Full prompt for deep mode. Includes conventions and hints. No test loop."""
    return f"""You are filling TODO placeholders in an event-sourced TypeScript codebase (eventualize-js/evdb).

## Key Conventions
- Pure handlers: commandHandler.ts NEVER imports storage, I/O, or time. Only stream.appendEvent*().
- appendEvent syntax: stream.appendEventMyEvent({{ field1, field2 }}) — plain payload, no generics.
- All relative imports use .js extension even for .ts source files.
- View state: read from stream.views.SliceStateMySlice.
- GWTS predicates: each spec branch returns a named predicate matching the spec description.
- Computed fields (timestamps, generated IDs) belong in endpoints only, never in pure handlers.

## Learned Hints
{hints}

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

Do NOT run tests — the CI pipeline handles that separately.
Do NOT read SKILL.md or any reference files. Everything you need is above.
Do NOT run evdb-diff, evdb-scaffold, or scan sessions.
Do NOT read files outside 'Files with TODOs'."""


# ── Haiku classification ─────────────────────────────────────────

def classify_complexity(claude_path: str, todo_content: str, provider: str) -> str:
    """Use Haiku (~$0.02) to classify slice complexity as 'sonnet' or 'opus'.

    Reads the full TODO spec and decides which model should implement it.
    Falls back to 'opus' on any error.
    """
    if provider == "bedrock":
        classify_model = "us.anthropic.claude-haiku-4-5-v1@bedrock"
    else:
        classify_model = "claude-haiku-4-5-20251001"

    prompt = """You are a complexity classifier for code generation tasks.
Read the TODO spec below and reply with ONLY one word.
Reply 'sonnet' if the task is straightforward (simple field mapping, basic CRUD, simple predicates, basic SQL upserts).
Reply 'opus' if the task requires complex logic (algorithms, simulations, mathematical formulas, multi-step aggregation, weighted calculations, accumulation patterns, complex business rules with many branches).
Reply with ONLY 'sonnet' or 'opus'.

---
""" + todo_content

    try:
        result = subprocess.run(
            [claude_path, "--print", "--dangerously-skip-permissions",
             "--model", classify_model,
             "--max-turns", "1",
             "--output-format", "text",
             prompt],
            capture_output=True, text=True, timeout=30,
        )
        output = result.stdout.strip().lower()
        if "sonnet" in output:
            return "sonnet"
        return "opus"
    except Exception:
        return "opus"


def resolve_model_for_auto(
    claude_path: str, todo_content: str, provider: str, model_resolution: dict,
) -> tuple[str, str, str]:
    """When policy says model=auto, use Haiku to pick sonnet or opus.

    Returns (model_name, model_id, method).
    """
    tier = classify_complexity(claude_path, todo_content, provider)
    provider_map = model_resolution.get(provider, model_resolution.get("anthropic", {}))
    model_id = provider_map.get(tier, "")
    return tier, model_id, "haiku_classified"


# ── Stats extraction ─────────────────────────────────────────────

def extract_stats(json_path: Path) -> dict:
    """Parse Claude Code JSON output, extract usage stats."""
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

    # Load policy decisions
    decisions_data = load_json(Path(args.decisions))
    decisions_lookup: dict[str, dict] = {}
    for d in decisions_data.get("decisions", []):
        decisions_lookup[d["slice"]] = d

    # Load learned hints (deep mode only)
    hints = ""
    hints_path = root / ".claude" / "skills" / "evdb-dev-v2" / "learned_hints.md"
    if hints_path.exists():
        hints = hints_path.read_text()

    # Load model resolution
    try:
        policy_cfg = load_config(POLICY_CONFIG)
        model_resolution = policy_cfg.get("model_resolution", {})
    except FileNotFoundError:
        model_resolution = {"anthropic": {"opus": "", "sonnet": "claude-sonnet-4-6"}}

    # Check claude CLI
    claude_path = shutil.which("claude")
    if not claude_path:
        print("ERROR: claude CLI not found", file=sys.stderr)
        sys.exit(1)

    start_time = time.time()
    totals = {"cost": 0.0, "turns": 0, "input_tokens": 0, "output_tokens": 0}
    summaries = []

    for slice_name in slice_names:
        print(f"\n{'='*50}", file=sys.stderr)
        print(f"  Filling: {slice_name}", file=sys.stderr)
        print(f"{'='*50}", file=sys.stderr)

        # Get policy decision for this slice
        decision = decisions_lookup.get(slice_name, {})
        if decision.get("action") == "block":
            print(f"  BLOCKED by policy: {decision.get('reason', '')}", file=sys.stderr)
            emit("ai_skipped", "implement_slice.py", slice=slice_name, context=context,
                 data={"reason": "blocked_by_policy", "rule": decision.get("rule_matched", "")})
            continue

        model_name = decision.get("model", "auto")
        model_id = decision.get("model_id", "")

        # Resolve directories
        slice_dir = find_slice_dir(root, context, slice_name, "slices")
        endpoint_dir = find_slice_dir(root, context, slice_name, "endpoints")
        if not slice_dir and not endpoint_dir:
            print(f"  SKIP: no directory found", file=sys.stderr)
            continue

        # Find TODO_CONTEXT.md
        todo_content, todo_file = find_todo_context(root, context, slice_dir, endpoint_dir)
        if not todo_content:
            print(f"  SKIP: no TODO_CONTEXT.md", file=sys.stderr)
            continue

        # When policy says "auto", use Haiku to classify complexity
        if model_name == "auto":
            model_name, model_id, method = resolve_model_for_auto(
                claude_path, todo_content, args.provider, model_resolution)
            print(f"  Complexity: {method} → {model_name}", file=sys.stderr)

        # ── Choose mode: FAST (sonnet) or DEEP (opus) ────────
        is_fast = (model_name == "sonnet")
        mode = FAST_MODE if is_fast else DEEP_MODE
        mode_label = "FAST" if is_fast else "DEEP"

        max_turns = mode["max_turns"]
        max_budget = mode["max_budget"]
        timeout = mode["timeout_min"] * 60

        if is_fast:
            prompt = build_fast_prompt(todo_content)
            cwd = resolve_slice_cwd(root, context, slice_dir, endpoint_dir)
        else:
            prompt = build_deep_prompt(todo_content, hints)
            cwd = resolve_slice_cwd(root, context, slice_dir, endpoint_dir)

        print(f"  Mode: {mode_label}", file=sys.stderr)
        print(f"  Model: {model_name} ({model_id or 'default'})", file=sys.stderr)
        print(f"  Budget: ${max_budget}, Turns: {max_turns}", file=sys.stderr)
        print(f"  CWD: {cwd}", file=sys.stderr)
        print(f"  TODO: {todo_file}", file=sys.stderr)

        # ── Run Claude Code ──────────────────────────────────
        model_flag = ["--model", model_id] if model_id else []
        output_path = slice_claude_output(slice_name)

        try:
            subprocess.run(
                [claude_path, "--print", "--dangerously-skip-permissions",
                 "--output-format", "json",
                 "--exclude-dynamic-system-prompt-sections",
                 "--max-budget-usd", str(max_budget),
                 *model_flag,
                 "--max-turns", str(max_turns),
                 prompt],
                capture_output=False,
                cwd=str(cwd),
                timeout=timeout,
                stdout=open(output_path, "w"),
                stderr=sys.stderr,
            )
        except subprocess.TimeoutExpired:
            print(f"  TIMEOUT after {mode['timeout_min']}min", file=sys.stderr)
        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)

        # Extract stats
        stats = extract_stats(output_path)
        write_json(slice_stats_path(slice_name), stats)

        # Audit: AI invocation with full traceability
        emit("ai_invocation", "implement_slice.py",
             slice=slice_name, context=context,
             data={
                 "mode": mode_label,
                 "model": model_name,
                 "model_id": model_id or "default",
                 "tokens_in": stats["input_tokens"],
                 "tokens_out": stats["output_tokens"],
                 "cost_usd": stats["cost"],
                 "turns": stats["turns"],
                 "max_budget_usd": max_budget,
                 "max_turns": max_turns,
                 "cwd": str(cwd),
                 "policy_rule": decision.get("rule_matched", ""),
             })

        totals["cost"] += stats["cost"]
        totals["turns"] += stats["turns"]
        totals["input_tokens"] += stats["input_tokens"]
        totals["output_tokens"] += stats["output_tokens"]
        if stats.get("result"):
            summaries.append(f"{slice_name}: {stats['result']}")

        print(f"  Done: {stats['turns']} turns, ${stats['cost']:.2f}", file=sys.stderr)

    # Aggregate
    totals["total_tokens"] = totals["input_tokens"] + totals["output_tokens"]
    write_json(CLAUDE_STATS, totals)
    CLAUDE_SUMMARY.write_text("\n".join(summaries)[:1000])

    elapsed = time.time() - start_time
    duration = f"{int(elapsed // 60)}m {int(elapsed % 60)}s"

    set_output("duration", duration)
    set_output("cost", f"{totals['cost']:.4f}")
    set_output("num_turns", str(totals["turns"]))

    print(f"\nTotal: {totals['turns']} turns, ${totals['cost']:.2f}, {duration}", file=sys.stderr)


if __name__ == "__main__":
    main()
