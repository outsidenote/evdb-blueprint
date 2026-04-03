#!/usr/bin/env python3
"""
scan_learn.py — Learning loop CLI for evdb-dev-v2.

Encodes patterns discovered during slice implementation into learned_hints.md
so future runs don't need to scan existing code or repeat trial-and-error.

Usage:
  python3 scan_learn.py append --category <category> --hint <text>
  python3 scan_learn.py from-violation --file <path> --reason <why-it-was-scanned>
  python3 scan_learn.py from-failure --test-output <file> --fix <what-was-fixed>
  python3 scan_learn.py list

Examples:
  # After figuring out commission formula from trial/error:
  python3 scan_learn.py append \\
    --category "Computed fields (commandHandler.ts)" \\
    --hint "Commission = amount * 0.01 (1%). Field: commission on WithdrawCommissionCalculated"

  # After scan guard flagged a file:
  python3 scan_learn.py from-violation \\
    --file "src/.../approvedMessages.ts" \\
    --reason "Was looking for how queue names are referenced in message producers"

  # After a test failed and was fixed:
  python3 scan_learn.py from-failure \\
    --test-output /tmp/test-output.txt \\
    --fix "commission field in expectedEvents must be a number, not a string"
"""
import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

SKILLS_DIR = Path(__file__).resolve().parent.parent
HINTS_FILE = SKILLS_DIR / "learned_hints.md"
SCAN_LOG = SKILLS_DIR / "scan-log.json"

TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")


def load_hints() -> str:
    if HINTS_FILE.exists():
        return HINTS_FILE.read_text()
    return ""


def append_under_section(content: str, section_heading: str, new_entry: str) -> str:
    """
    Inserts new_entry under the matching ## section heading.
    If the section doesn't exist, appends a new one at the end.
    """
    lines = content.splitlines(keepends=True)
    insert_at = None

    # Find the target section
    target = f"## {section_heading}"
    in_section = False
    for i, line in enumerate(lines):
        if line.strip() == target:
            in_section = True
            continue
        if in_section:
            # Insert before the next ## heading or at end of section
            if line.startswith("## ") or line.startswith("---"):
                insert_at = i
                break

    if insert_at is None and in_section:
        # Section found but no following heading — append at end
        insert_at = len(lines)

    if insert_at is None:
        # Section not found — append new section at end
        return content.rstrip() + f"\n\n## {section_heading}\n\n{new_entry}\n"

    lines.insert(insert_at, new_entry + "\n")
    return "".join(lines)


def cmd_append(args: argparse.Namespace) -> None:
    content = load_hints()
    entry = f"### {args.hint}\n- Source: manual encode, {TODAY}"
    if args.slice:
        entry += f", slice={args.slice}"
    entry += "\n"

    updated = append_under_section(content, args.category, entry)
    HINTS_FILE.write_text(updated)
    print(f"[scan-learn] Appended to '{args.category}': {args.hint[:60]}...")


def cmd_from_violation(args: argparse.Namespace) -> None:
    """
    Encode a pattern discovered via a scan violation.
    The file that was scanned tells us what category it belongs to.
    """
    file_path = args.file
    reason = args.reason

    # Infer category from file path
    if "messages" in file_path:
        category = "Scan violations → encoded here"
        hint = (
            f"### Pattern from scanning {Path(file_path).name}\n"
            f"- Reason scanned: {reason}\n"
            f"- Encode fix: add this pattern to TODO_CONTEXT.md template in evdb_scaffold.py\n"
            f"- Source: scan violation, {TODAY}"
        )
    elif "gwts" in file_path:
        category = "Predicates (gwts.ts)"
        hint = (
            f"### Pattern from scanning {Path(file_path).name}\n"
            f"- Reason scanned: {reason}\n"
            f"- Source: scan violation, {TODAY}"
        )
    elif "commandHandler" in file_path:
        category = "Computed fields (commandHandler.ts)"
        hint = (
            f"### Pattern from scanning {Path(file_path).name}\n"
            f"- Reason scanned: {reason}\n"
            f"- Source: scan violation, {TODAY}"
        )
    else:
        category = "Scan violations → encoded here"
        hint = (
            f"### Pattern from scanning: {Path(file_path).name}\n"
            f"- Reason scanned: {reason}\n"
            f"- File path: {file_path}\n"
            f"- Next step: identify the pattern and move it to the correct category above\n"
            f"- Source: scan violation, {TODAY}"
        )

    content = load_hints()
    updated = append_under_section(content, category, hint + "\n")
    HINTS_FILE.write_text(updated)
    print(f"[scan-learn] Encoded violation from: {file_path}")
    print(f"[scan-learn] Category: {category}")


def cmd_from_failure(args: argparse.Namespace) -> None:
    """Encode a pattern discovered when a test failed."""
    fix = args.fix
    test_output = args.test_output

    # Read test output for context if provided
    context = ""
    if test_output and Path(test_output).exists():
        raw = Path(test_output).read_text()
        # Grab first 10 lines of test output as context
        context_lines = raw.splitlines()[:10]
        context = "\n".join(f"  > {l}" for l in context_lines)

    hint = (
        f"### Test failure fix: {fix[:80]}\n"
        f"- Fix applied: {fix}\n"
    )
    if context:
        hint += f"- Test output excerpt:\n{context}\n"
    hint += f"- Source: test failure encode, {TODAY}"

    category = "Test cases (command.slice.test.ts)"
    content = load_hints()
    updated = append_under_section(content, category, hint + "\n")
    HINTS_FILE.write_text(updated)
    print(f"[scan-learn] Encoded test failure fix: {fix[:60]}...")


def cmd_list(_args: argparse.Namespace) -> None:
    content = load_hints()
    if not content:
        print("[scan-learn] learned_hints.md is empty.")
        return
    print(content)


def main() -> None:
    parser = argparse.ArgumentParser(description="Encode learnings into learned_hints.md")
    sub = parser.add_subparsers(dest="command", required=True)

    p_append = sub.add_parser("append", help="Append a hint under a category")
    p_append.add_argument("--category", required=True, help="Section heading (e.g. 'Predicates (gwts.ts)')")
    p_append.add_argument("--hint", required=True, help="The pattern or rule to encode")
    p_append.add_argument("--slice", default="", help="Slice name this was discovered in (optional)")

    p_viol = sub.add_parser("from-violation", help="Encode a pattern from a scan violation")
    p_viol.add_argument("--file", required=True, help="File path that was scanned")
    p_viol.add_argument("--reason", required=True, help="Why the AI scanned this file")

    p_fail = sub.add_parser("from-failure", help="Encode a pattern from a test failure fix")
    p_fail.add_argument("--fix", required=True, help="What was fixed and why")
    p_fail.add_argument("--test-output", default="", help="Path to captured test output (optional)")

    sub.add_parser("list", help="Print learned_hints.md")

    args = parser.parse_args()
    commands = {
        "append": cmd_append,
        "from-violation": cmd_from_violation,
        "from-failure": cmd_from_failure,
        "list": cmd_list,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
