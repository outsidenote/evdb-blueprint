#!/usr/bin/env python3
"""Stage: AI code generation — fill business logic for all slices in a context.

Three paths per slice:
  SKIP:  no meaningful TODOs → deterministic strip, zero cost, instant
  FAST:  sonnet, cwd locked, slim prompt, relevant hints only, 6 turns, $0.30
  DEEP:  opus, cwd locked, full prompt, relevant hints only, 20 turns, $2.00

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
import re
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


def resolve_slice_cwd(root: Path, context: str, slice_dir: str | None, endpoint_dir: str | None) -> Path:
    """Resolve the working directory — locked to slice/endpoint directory."""
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

def scan_todos(directory: Path) -> dict:
    """Scan .ts files in a directory for TODO markers. Returns per-file counts.

    Ignores TODO_CONTEXT.md (that's the spec, not generated code).
    Ignores test files (tests are filled by AI as part of the slice, not separately).
    """
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
            rel = str(ts_file.relative_to(directory))
            todos[rel] = file_todos

    return todos


def is_trivial_slice(todo_map: dict[str, list[str]]) -> bool:
    """Determine if a slice can be handled without AI.

    Trivial means:
      - Zero TODOs in any file, OR
      - Only generic/cosmetic TODOs that don't affect functionality
    """
    if not todo_map:
        return True  # no TODOs at all → scaffold produced complete code

    # Generic TODOs that the scaffold leaves but don't need AI
    GENERIC_PATTERNS = [
        r"TODO:\s*select specific fields to store",
        r"TODO:\s*adjust .* if needed",
        r"TODO:\s*derive from command fields",
    ]

    for _, todos in todo_map.items():
        for todo_line in todos:
            is_generic = any(re.search(p, todo_line, re.I) for p in GENERIC_PATTERNS)
            if not is_generic:
                return False  # found a real TODO that needs AI

    return True  # all TODOs are generic


def strip_generic_todos(directory: Path) -> int:
    """Remove generic TODO comments from .ts files. Returns count of lines cleaned."""
    cleaned = 0
    if not directory.exists():
        return cleaned

    for ts_file in directory.rglob("*.ts"):
        if "TODO_CONTEXT" in ts_file.name or ".test." in ts_file.name:
            continue

        try:
            content = ts_file.read_text()
            original = content
            # Remove inline TODO comments but keep the code
            content = re.sub(r"\s*//\s*TODO:.*$", "", content, flags=re.MULTILINE)
            if content != original:
                ts_file.write_text(content)
                cleaned += 1
        except Exception:
            pass

    return cleaned


# ── Hint retrieval ───────────────────────────────────────────────

# Map file patterns to hint section headers
HINT_SECTIONS = {
    "gwts.ts": "## How to derive predicates (gwts.ts)",
    "commandHandler.ts": "## How to derive computed field values (commandHandler.ts)",
    "view": "## How to derive view accumulation (SliceState views)",
    "test.ts": "## How to construct test data (command.slice.test.ts)",
    "domain": "## Domain-specific discoveries",
}


def select_hints(full_hints: str, todo_files: list[str]) -> str:
    """Select only the hint sections relevant to the files that have TODOs.

    Instead of dumping the entire learned_hints.md (~120 lines) into every prompt,
    pick the 1-3 sections that match the files Claude will actually edit.
    """
    if not full_hints or not todo_files:
        return ""

    # Determine which sections are needed based on file names
    needed_keys = set()
    files_lower = " ".join(f.lower() for f in todo_files)

    if "gwts" in files_lower:
        needed_keys.add("gwts.ts")
    if "commandhandler" in files_lower:
        needed_keys.add("commandHandler.ts")
    if "view" in files_lower or "state" in files_lower:
        needed_keys.add("view")
    if "test" in files_lower:
        needed_keys.add("test.ts")

    # Always include domain discoveries if they exist (they're short)
    needed_keys.add("domain")

    if not needed_keys:
        return ""

    # Extract matching sections from the hints file
    sections = []
    for key in needed_keys:
        header = HINT_SECTIONS.get(key, "")
        if not header or header not in full_hints:
            continue

        # Find section boundaries: from header to next ## or end
        start = full_hints.index(header)
        next_section = full_hints.find("\n## ", start + len(header))
        if next_section == -1:
            section_text = full_hints[start:].strip()
        else:
            section_text = full_hints[start:next_section].strip()

        # Skip domain section if it only has the placeholder
        if key == "domain" and "No domain-specific discoveries yet" in section_text:
            continue

        sections.append(section_text)

    return "\n\n---\n\n".join(sections)


# ── Prompts ──────────────────────────────────────────────────────

def build_fast_prompt(todo_content: str, hints: str) -> str:
    """Slim prompt for fast mode. Relevant hints only."""
    hint_block = f"\n## Hints\n{hints}\n" if hints else ""

    return f"""Implement TODOs in this TypeScript slice.
{hint_block}
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
    """Full prompt for deep mode. Relevant hints only, no test loop."""
    hint_block = f"\n## Relevant Hints\n{hints}\n" if hints else ""

    return f"""You are filling TODO placeholders in an event-sourced TypeScript codebase (eventualize-js/evdb).

## Key Conventions
- Pure handlers: commandHandler.ts NEVER imports storage, I/O, or time. Only stream.appendEvent*().
- appendEvent syntax: stream.appendEventMyEvent({{ field1, field2 }}) — plain payload, no generics.
- All relative imports use .js extension even for .ts source files.
- View state: read from stream.views.SliceStateMySlice.
- GWTS predicates: each spec branch returns a named predicate matching the spec description.
- Computed fields (timestamps, generated IDs) belong in endpoints only, never in pure handlers.
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

Do NOT run tests — the CI pipeline handles that separately.
Do NOT read SKILL.md or any reference files. Everything you need is above.
Do NOT run evdb-diff, evdb-scaffold, or scan sessions.
Do NOT read files outside 'Files with TODOs'."""


# ── Haiku classification ─────────────────────────────────────────

def classify_complexity(claude_path: str, todo_content: str, provider: str) -> str:
    """Use Haiku (~$0.02) to classify slice complexity as 'sonnet' or 'opus'."""
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
    """When policy says model=auto, use Haiku to pick sonnet or opus."""
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

    # Load full hints file once (sections are selected per-slice)
    full_hints = ""
    hints_path = root / ".claude" / "skills" / "evdb-dev-v2" / "learned_hints.md"
    if hints_path.exists():
        full_hints = hints_path.read_text()

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

        cwd = resolve_slice_cwd(root, context, slice_dir, endpoint_dir)

        # ── Deterministic fast-path: skip AI if trivial ──────
        todo_map = scan_todos(cwd)
        if is_trivial_slice(todo_map):
            cleaned = strip_generic_todos(cwd)
            print(f"  DETERMINISTIC: trivial slice, stripped {cleaned} generic TODO(s)", file=sys.stderr)
            print(f"  Cost: $0.00, Turns: 0", file=sys.stderr)
            emit("ai_skipped", "implement_slice.py", slice=slice_name, context=context,
                 data={"reason": "trivial_slice", "todos_found": len(todo_map),
                        "cleaned": cleaned})
            summaries.append(f"{slice_name}: deterministic (trivial)")
            continue

        # ── Haiku classification if model=auto ───────────────
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

        # ── Select relevant hints ────────────────────────────
        todo_files = list(todo_map.keys())
        hints = select_hints(full_hints, todo_files)
        hint_count = hints.count("##") if hints else 0

        if is_fast:
            prompt = build_fast_prompt(todo_content, hints)
        else:
            prompt = build_deep_prompt(todo_content, hints)

        print(f"  Mode: {mode_label}", file=sys.stderr)
        print(f"  Model: {model_name} ({model_id or 'default'})", file=sys.stderr)
        print(f"  Budget: ${max_budget}, Turns: {max_turns}", file=sys.stderr)
        print(f"  CWD: {cwd}", file=sys.stderr)
        print(f"  TODOs: {sum(len(v) for v in todo_map.values())} in {len(todo_map)} file(s)", file=sys.stderr)
        print(f"  Hints: {hint_count} section(s) selected", file=sys.stderr)

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
                 "todo_files": todo_files,
                 "hint_sections": hint_count,
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
