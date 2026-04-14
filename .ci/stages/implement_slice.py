#!/usr/bin/env python3
"""Stage: AI code generation — fill business logic for all slices in a context.

Reads policy decisions for model/budget/turns per slice.
Runs Claude Code via subprocess, one conversation per slice.
Extracts stats and aggregates.

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
    DECISIONS, CLAUDE_STATS, CLAUDE_SUMMARY,
    slice_stats_path, slice_claude_output,
    load_json, write_json, set_output,
)
from lib.audit import emit


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


def find_test_file(root: Path, context: str, slice_dir: str | None, endpoint_dir: str | None) -> str:
    """Find the test command for this slice."""
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


def build_prompt(todo_content: str, test_cmd: str, hints: str) -> str:
    """Build the AI prompt — self-contained, no file reading needed."""
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
3. Run the test: {test_cmd}
4. If tests fail, read the error, fix the code, re-run until green.

Do NOT read SKILL.md or any reference files. Everything you need is above.
Do NOT run evdb-diff, evdb-scaffold, or scan sessions.
Do NOT read files outside 'Files with TODOs'."""


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

    # Load learned hints
    hints = ""
    hints_path = root / ".claude" / "skills" / "evdb-dev-v2" / "learned_hints.md"
    if hints_path.exists():
        hints = hints_path.read_text()

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

        model_id = decision.get("model_id", "")
        max_turns = decision.get("max_turns", 20)
        max_budget = decision.get("max_budget_usd", 2.00)

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

        print(f"  Model: {decision.get('model', 'default')} ({model_id or 'default'})", file=sys.stderr)
        print(f"  Budget: ${max_budget}, Turns: {max_turns}", file=sys.stderr)
        print(f"  TODO: {todo_file}", file=sys.stderr)

        # Build prompt and run
        test_cmd = find_test_file(root, context, slice_dir, endpoint_dir)
        prompt = build_prompt(todo_content, test_cmd, hints)

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
                cwd=str(root),
                timeout=20 * 60,
                stdout=open(output_path, "w"),
                stderr=sys.stderr,
            )
        except subprocess.TimeoutExpired:
            print(f"  TIMEOUT after 20min", file=sys.stderr)
        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)

        # Extract stats
        stats = extract_stats(output_path)
        write_json(slice_stats_path(slice_name), stats)

        # Audit: AI invocation with full traceability
        emit("ai_invocation", "implement_slice.py",
             slice=slice_name, context=context,
             data={
                 "model": decision.get("model", "unknown"),
                 "model_id": model_id or "default",
                 "tokens_in": stats["input_tokens"],
                 "tokens_out": stats["output_tokens"],
                 "cost_usd": stats["cost"],
                 "turns": stats["turns"],
                 "max_budget_usd": max_budget,
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
