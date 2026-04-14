#!/usr/bin/env python3
"""Stage: Extract domain patterns from successful AI implementations.

Runs after verify+test passes. Compares scaffold output (TODOs) against
AI-filled output (real code) and extracts reusable patterns into
learned_hints.md via scan_learn.py.

Only fires on success — failed runs don't teach good patterns.

Usage:
    python3 .ci/stages/learn.py \
        --root . \
        --context Portfolio \
        --slices "addloantoportfolio,assessloanrisk"
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.audit import emit

SKILLS_DIR = Path(__file__).resolve().parent.parent.parent / ".claude" / "skills"
SCAN_LEARN = SKILLS_DIR / "evdb-dev-v2" / "scripts" / "scan_learn.py"
HINTS_FILE = SKILLS_DIR / "evdb-dev-v2" / "learned_hints.md"
MARKER = "<!-- scan_learn.py append writes below this line -->"
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ── Pattern extractors ───────────────────────────────────────────

def extract_predicate_patterns(gwts_path: Path, slice_name: str) -> list[dict]:
    """Extract predicate logic from a filled gwts.ts file.

    Looks for exported functions that return boolean expressions.
    Captures the predicate name and the condition.
    """
    if not gwts_path.exists():
        return []

    content = gwts_path.read_text()
    patterns = []

    # Match: export const predicateName = (state, command): boolean => <expression>
    # Or: export function predicateName(state, command): boolean { return <expression> }
    pred_re = re.compile(
        r"export\s+const\s+(\w+)\s*=\s*\([^)]*\)(?:\s*:\s*boolean)?\s*=>\s*\n?\s*(.+?)(?:;|\n)",
        re.MULTILINE,
    )
    for match in pred_re.finditer(content):
        name = match.group(1)
        condition = match.group(2).strip().rstrip(";")

        # Skip if still a TODO or placeholder
        if "TODO" in condition or "false" == condition or "true" == condition:
            continue

        patterns.append({
            "type": "predicate",
            "name": name,
            "condition": condition,
            "slice": slice_name,
            "file": "gwts.ts",
        })

    return patterns


def extract_handler_patterns(handler_path: Path, slice_name: str) -> list[dict]:
    """Extract computed field derivations from commandHandler.ts.

    Looks for appendEvent calls with computed values (not just forwarded from command).
    """
    if not handler_path.exists():
        return []

    content = handler_path.read_text()
    patterns = []

    # Find lines with computed values (arithmetic, string interpolation, ternary)
    computed_re = re.compile(
        r"(\w+):\s*(.+?(?:\*|/|\+|-|`|\?).+?)(?:,|\n)",
    )
    for match in computed_re.finditer(content):
        field_name = match.group(1).strip()
        expression = match.group(2).strip().rstrip(",")

        # Skip simple forwards like: field: command.field
        if re.match(r"^command\.\w+$", expression):
            continue
        # Skip TODO placeholders
        if "TODO" in expression:
            continue

        patterns.append({
            "type": "computed_field",
            "field": field_name,
            "expression": expression,
            "slice": slice_name,
            "file": "commandHandler.ts",
        })

    return patterns


def extract_projection_patterns(index_path: Path, slice_name: str) -> list[dict]:
    """Extract SQL patterns from projection index.ts.

    Looks for non-generic SQL (anything beyond the scaffold's default UPSERT).
    """
    if not index_path.exists():
        return []

    content = index_path.read_text()
    patterns = []

    # Check if the SQL was customized beyond the generic scaffold
    generic_marker = "JSON.stringify(p)"
    if generic_marker in content:
        return []  # still using generic — nothing learned

    # Extract the SQL template
    sql_re = re.compile(r"sql:\s*`([^`]+)`", re.DOTALL)
    for match in sql_re.finditer(content):
        sql = match.group(1).strip()
        # Only capture if it has field-specific logic
        if "payload ->" in sql or "$4" in sql or "jsonb_set" in sql:
            patterns.append({
                "type": "projection_sql",
                "sql_excerpt": sql[:200],
                "slice": slice_name,
                "file": "index.ts",
            })

    return patterns


# ── Hint formatter ───────────────────────────────────────────────

def format_hint(pattern: dict) -> tuple[str, str]:
    """Format a pattern into a hint entry and its category.

    Returns (category, formatted_hint).
    """
    ptype = pattern["type"]
    slice_name = pattern.get("slice", "")

    if ptype == "predicate":
        category = "Domain-specific discoveries"
        hint = (
            f"- **{pattern['name']}**: `{pattern['condition']}` "
            f"(slice: {slice_name}, {TODAY})"
        )
    elif ptype == "computed_field":
        category = "Domain-specific discoveries"
        hint = (
            f"- **{pattern['field']}** = `{pattern['expression']}` "
            f"(slice: {slice_name}, {TODAY})"
        )
    elif ptype == "projection_sql":
        category = "Domain-specific discoveries"
        hint = (
            f"- **{slice_name}** projection: field-specific SQL "
            f"(slice: {slice_name}, {TODAY})"
        )
    else:
        category = "Domain-specific discoveries"
        hint = f"- {ptype}: {pattern} ({TODAY})"

    return category, hint


# ── Deduplication ────────────────────────────────────────────────

def is_duplicate(hint_text: str, existing_hints: str) -> bool:
    """Check if this hint (or something very similar) already exists."""
    # Extract the key part (predicate name or field name)
    key_match = re.search(r"\*\*(\w+)\*\*", hint_text)
    if not key_match:
        return False
    key = key_match.group(1)

    # If the same key appears in existing hints, it's a duplicate
    return f"**{key}**" in existing_hints


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Extract domain patterns from successful runs")
    parser.add_argument("--root", default=".")
    parser.add_argument("--context", required=True)
    parser.add_argument("--slices", required=True)
    parser.add_argument("--verify-passed", default="true")
    parser.add_argument("--test-passed", default="true")
    args = parser.parse_args()

    # Only learn from successful runs
    if args.verify_passed.lower() != "true" or args.test_passed.lower() != "true":
        print("SKIP: only learn from fully passing runs", file=sys.stderr)
        return

    root = Path(args.root).resolve()
    context = args.context
    slice_names = [s.strip() for s in args.slices.split(",") if s.strip()]

    # Load existing hints to check for duplicates
    existing_hints = HINTS_FILE.read_text() if HINTS_FILE.exists() else ""

    all_patterns = []

    for slice_name in slice_names:
        # Find the slice directory
        slice_parent = root / "src" / "BusinessCapabilities" / context / "slices"
        slice_dir = None
        if slice_parent.exists():
            for d in slice_parent.iterdir():
                if d.is_dir() and d.name.lower() == slice_name.lower():
                    slice_dir = d
                    break

        if not slice_dir:
            continue

        # Extract patterns from each file type
        gwts = slice_dir / "gwts.ts"
        handler = slice_dir / "commandHandler.ts"
        projection = slice_dir / "index.ts"

        all_patterns.extend(extract_predicate_patterns(gwts, slice_name))
        all_patterns.extend(extract_handler_patterns(handler, slice_name))
        all_patterns.extend(extract_projection_patterns(projection, slice_name))

    if not all_patterns:
        print("No new patterns discovered", file=sys.stderr)
        return

    # Format and deduplicate
    new_hints = []
    for pattern in all_patterns:
        category, hint_text = format_hint(pattern)
        if not is_duplicate(hint_text, existing_hints):
            new_hints.append((category, hint_text))

    if not new_hints:
        print(f"Found {len(all_patterns)} patterns, all already known", file=sys.stderr)
        return

    # Append to learned_hints.md
    content = existing_hints

    # Replace the placeholder if present
    if "No domain-specific discoveries yet" in content:
        content = content.replace(
            "_No domain-specific discoveries yet. First successful run will add entries here._",
            "",
        )

    # Append new hints under the domain section
    for category, hint_text in new_hints:
        # Find the marker line and append after it
        if MARKER in content:
            marker_pos = content.index(MARKER) + len(MARKER)
            content = content[:marker_pos] + f"\n{hint_text}" + content[marker_pos:]
        else:
            content = content.rstrip() + f"\n{hint_text}\n"

    HINTS_FILE.write_text(content)

    # Audit
    emit("patterns_learned", "learn.py", context=context,
         data={
             "total_patterns": len(all_patterns),
             "new_patterns": len(new_hints),
             "duplicates_skipped": len(all_patterns) - len(new_hints),
             "categories": list({h[0] for h in new_hints}),
         })

    print(f"Learned {len(new_hints)} new pattern(s) from {len(slice_names)} slice(s):", file=sys.stderr)
    for _, hint in new_hints:
        print(f"  {hint}", file=sys.stderr)


if __name__ == "__main__":
    main()
