#!/usr/bin/env python3
"""Deterministic diff summary — parses git diff to extract semantic changes.

Produces a per-file, per-slice summary of what changed so reviewers know
exactly where to focus without opening every file.

Usage:
    python3 .ci/render/diff_summary.py \
        --context Portfolio --base-branch main

Writes /tmp/diff-summary.json and prints markdown to stdout.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from collections import defaultdict
from pathlib import Path


# ── Per-file parsers ────────────────────────────────────────────

def _parse_gwts(added_lines: list[str]) -> str:
    """Extract exported predicate/function names from gwts.ts additions."""
    names: list[str] = []
    for line in added_lines:
        m = re.search(r"export\s+(?:const|function)\s+(\w+)", line)
        if m:
            names.append(m.group(1))
    if names:
        return f"added predicates: `{'`, `'.join(names)}`"
    count = len([l for l in added_lines if l.strip()])
    return f"added {count} lines" if count else ""


def _parse_command_handler(added_lines: list[str]) -> str:
    """Count branches and extract error messages from commandHandler.ts."""
    branches = 0
    errors: list[str] = []
    for line in added_lines:
        if re.search(r"\b(if|else\s+if|case)\b", line):
            branches += 1
        m = re.search(r"""['"`]([^'"`]{5,80})['"`]""", line)
        if m and any(kw in line.lower() for kw in ("error", "throw", "reject", "invalid", "fail")):
            errors.append(m.group(1))
    parts: list[str] = []
    if branches:
        parts.append(f"added {branches} branches")
    if errors:
        parts.append(f"errors: {', '.join(repr(e) for e in errors[:3])}")
    return " — ".join(parts) if parts else f"added {len(added_lines)} lines"


def _parse_enrichment(added_lines: list[str]) -> str:
    """Extract function names from enrichment.ts."""
    names: list[str] = []
    for line in added_lines:
        m = re.search(r"(?:export\s+)?(?:const|function|async function)\s+(\w+)", line)
        if m and m.group(1) not in ("const", "let", "var"):
            names.append(m.group(1))
    if names:
        return f"added functions: `{'`, `'.join(names)}`"
    return f"added {len(added_lines)} lines"


def _parse_sql_or_index(added_lines: list[str]) -> str:
    """Extract column names and aggregation functions from SQL/index.ts."""
    columns: list[str] = []
    agg_fns: list[str] = []
    for line in added_lines:
        # SQL column aliases
        m = re.search(r"AS\s+[\"']?(\w+)[\"']?", line, re.IGNORECASE)
        if m:
            columns.append(m.group(1))
        # jsonb_build_object keys
        for km in re.finditer(r"'(\w+)'", line):
            if km.group(1) not in columns:
                columns.append(km.group(1))
        # Aggregation functions
        for fn in re.findall(r"\b(SUM|AVG|COUNT|MAX|MIN|COALESCE|jsonb_build_object)\b", line, re.IGNORECASE):
            if fn.upper() not in agg_fns:
                agg_fns.append(fn.upper())
    parts: list[str] = []
    if columns:
        parts.append(f"columns: `{'`, `'.join(columns[:6])}`")
    if agg_fns:
        parts.append(f"using {', '.join(agg_fns)}")
    return " — ".join(parts) if parts else f"added {len(added_lines)} lines"


def _parse_test(added_lines: list[str]) -> str:
    """Count test cases from *.test.ts."""
    tests = 0
    for line in added_lines:
        if re.search(r"""\b(it|test)\s*\(""", line):
            tests += 1
    return f"added {tests} test cases" if tests else f"added {len(added_lines)} lines"


def _parse_generic(added_lines: list[str]) -> str:
    """Fallback: line count summary."""
    count = len([l for l in added_lines if l.strip()])
    return f"added {count} lines" if count else ""


PARSERS: dict[str, callable] = {
    "gwts.ts": _parse_gwts,
    "commandHandler.ts": _parse_command_handler,
    "enrichment.ts": _parse_enrichment,
    "index.ts": _parse_sql_or_index,
}


def _pick_parser(filename: str):
    """Select the right parser for a given filename."""
    base = Path(filename).name
    if base in PARSERS:
        return PARSERS[base]
    if base.endswith(".test.ts"):
        return _parse_test
    if base.endswith(".sql"):
        return _parse_sql_or_index
    return _parse_generic


# ── Diff parsing ────────────────────────────────────────────────

def _run_git_diff(base_branch: str, context: str) -> str:
    """Run git diff between base branch and HEAD for the given context."""
    path_filter = f"src/BusinessCapabilities/{context}/"
    try:
        result = subprocess.run(
            ["git", "diff", f"{base_branch}..HEAD", "--", path_filter],
            capture_output=True, text=True, timeout=30,
        )
        return result.stdout
    except Exception:
        return ""


def _parse_diff(diff_text: str) -> dict[str, dict[str, list[str]]]:
    """Parse unified diff into {slice: {file: [added_lines]}}."""
    slices: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    current_file = ""
    for line in diff_text.splitlines():
        if line.startswith("diff --git"):
            # Extract file path from "diff --git a/path b/path"
            parts = line.split(" b/")
            if len(parts) == 2:
                current_file = parts[1]
        elif line.startswith("+") and not line.startswith("+++"):
            if current_file:
                # Derive slice from path: src/BusinessCapabilities/Context/SliceName/file.ts
                path_parts = current_file.split("/")
                if len(path_parts) >= 4:
                    slice_name = path_parts[3] if len(path_parts) > 3 else "root"
                    filename = path_parts[-1]
                    slices[slice_name][filename].append(line[1:])  # strip leading +
    return dict(slices)


# ── Main ────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Deterministic diff summary")
    parser.add_argument("--context", required=True, help="Context name (PascalCase)")
    parser.add_argument("--base-branch", required=True, help="Base branch for diff")
    args = parser.parse_args()

    diff_text = _run_git_diff(args.base_branch, args.context)
    if not diff_text:
        # No diff — write empty summary
        result = {"slices": {}, "total_files": 0}
        Path("/tmp/diff-summary.json").write_text(json.dumps(result, indent=2) + "\n")
        return

    parsed = _parse_diff(diff_text)

    # Build structured summary
    summary: dict[str, list[dict]] = {}
    total_files = 0

    for slice_name, files in sorted(parsed.items()):
        slice_items: list[dict] = []
        for filename, added_lines in sorted(files.items()):
            if not added_lines:
                continue
            parse_fn = _pick_parser(filename)
            desc = parse_fn(added_lines)
            if desc:
                slice_items.append({"file": filename, "summary": desc})
                total_files += 1
        if slice_items:
            summary[slice_name] = slice_items

    # Write JSON artifact
    result = {"slices": summary, "total_files": total_files}
    Path("/tmp/diff-summary.json").write_text(json.dumps(result, indent=2) + "\n")

    # Print markdown to stdout
    if not summary:
        return

    print(f"### Changes")
    print(f"<details><summary>{total_files} files changed across {len(summary)} slices</summary>")
    print()
    for slice_name, items in summary.items():
        print(f"**{slice_name}:**")
        for item in items:
            print(f"- `{item['file']}` \u2014 {item['summary']}")
        print()
    print("</details>")


if __name__ == "__main__":
    main()
