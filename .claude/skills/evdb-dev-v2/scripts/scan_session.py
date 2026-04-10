#!/usr/bin/env python3
"""
scan_session.py — Session manager for the evdb-dev-v2 zero-scan test.

Usage:
  python3 scan_session.py start --slice <folderName> --context <context> --root <projectRoot>
  python3 scan_session.py stop
  python3 scan_session.py status
  python3 scan_session.py assert        # exit 1 if violations exist in current session
  python3 scan_session.py report        # print full violation report + learning suggestions
  python3 scan_session.py clear         # wipe the scan log

A "session" tracks one skill run for one slice. While active, scan_guard.py
logs every Read call and flags paths outside the allowed set as violations.

Allowed paths (computed from --slice, --context, --root):
  {root}/.eventmodel/                                         (event model input)
  {root}/src/BusinessCapabilities/{context}/slices/{SliceName}/  (scaffold output)

Anything else is a violation — the AI should not need to read existing code
to fill in business logic. If it does, that pattern should be encoded into
TODO_CONTEXT.md or SKILL.md so future runs don't need to scan.
"""
import argparse
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

SKILLS_DIR = Path(__file__).resolve().parent.parent
SESSION_FILE = SKILLS_DIR / ".scan-session.json"
SCAN_LOG = SKILLS_DIR / "scan-log.json"


# ── Helpers ───────────────────────────────────────────────────────────────────

def pascal_case(folder: str) -> str:
    """funddeposit → FundDeposit, withdraw-funds → WithdrawFunds"""
    folder = folder.replace("-", " ").replace("_", " ")
    return "".join(w.capitalize() for w in folder.split())


def slice_name_from_json(root: str, context: str, folder: str) -> str:
    """
    Read the slice title from slice.json and derive the pascal-case name.
    Falls back to pascal_case(folder) if slice.json is missing or has no title.

    slice title "slice: Record Deposit" → strip "slice: " prefix → "Record Deposit"
    → words.capitalize() → "RecordDeposit"
    """
    slice_json = Path(root) / ".eventmodel" / ".slices" / context / folder / "slice.json"
    if slice_json.exists():
        try:
            data = json.loads(slice_json.read_text())
            title: str = data.get("title", "")
            # Strip common "slice: " prefix
            if title.lower().startswith("slice:"):
                title = title[len("slice:"):].strip()
            if title:
                return "".join(w.capitalize() for w in title.split())
        except Exception:
            pass
    return pascal_case(folder)


def load_log() -> list:
    if SCAN_LOG.exists():
        try:
            return json.loads(SCAN_LOG.read_text())
        except Exception:
            pass
    return []


def load_session() -> dict:
    if SESSION_FILE.exists():
        try:
            return json.loads(SESSION_FILE.read_text())
        except Exception:
            pass
    return {"active": False}


# ── Commands ──────────────────────────────────────────────────────────────────

def cmd_start(args: argparse.Namespace) -> None:
    root = Path(args.root).resolve()
    slice_name = slice_name_from_json(str(root), args.context, args.slice)

    allowed_prefixes = [
        str(root / ".eventmodel") + "/",
        str(root / "src" / "BusinessCapabilities" / args.context / "slices" / slice_name) + "/",
    ]

    session = {
        "active": True,
        "session_id": str(uuid.uuid4()),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "slice": args.slice,
        "slice_name": slice_name,
        "context": args.context,
        "root": str(root),
        "allowed_prefixes": allowed_prefixes,
    }

    SESSION_FILE.write_text(json.dumps(session, indent=2))

    print(f"[scan-session] Session started for slice '{slice_name}' (context: {args.context})")
    print(f"[scan-session] Allowed paths:")
    for p in allowed_prefixes:
        print(f"  {p}")
    print(f"[scan-session] Violations will be logged to: {SCAN_LOG}")


def cmd_stop(_args: argparse.Namespace) -> None:
    session = load_session()
    if not session.get("active"):
        print("[scan-session] No active session.")
        return

    session["active"] = False
    session["stopped_at"] = datetime.now(timezone.utc).isoformat()
    SESSION_FILE.write_text(json.dumps(session, indent=2))
    print(f"[scan-session] Session stopped for slice '{session.get('slice')}'.")


def cmd_status(_args: argparse.Namespace) -> None:
    session = load_session()
    if not session.get("active"):
        print("[scan-session] No active session.")
        return

    print(f"[scan-session] Active session: slice='{session['slice']}' context='{session['context']}'")
    print(f"[scan-session] Started: {session['started_at']}")
    print(f"[scan-session] Allowed prefixes:")
    for p in session["allowed_prefixes"]:
        print(f"  {p}")

    log = load_log()
    session_id = session["session_id"]
    violations = [e for e in log if e.get("session_id") == session_id and e.get("type") == "violation"]
    allowed = [e for e in log if e.get("session_id") == session_id and e.get("type") == "allowed"]
    print(f"[scan-session] Reads so far: {len(allowed)} allowed, {len(violations)} violations")


def cmd_assert(_args: argparse.Namespace) -> None:
    session = load_session()
    session_id = session.get("session_id")

    log = load_log()
    violations = [e for e in log if e.get("session_id") == session_id and e.get("type") == "violation"]

    if not violations:
        print(f"[scan-session] PASS: zero scan violations for slice '{session.get('slice')}'")
        sys.exit(0)

    print(f"[scan-session] FAIL: {len(violations)} scan violation(s) for slice '{session.get('slice')}':")
    for v in violations:
        print(f"  {v['file_path']}")
    sys.exit(1)


def cmd_report(_args: argparse.Namespace) -> None:
    session = load_session()
    session_id = session.get("session_id")
    slice_name = session.get("slice", "unknown")

    log = load_log()
    violations = [e for e in log if e.get("session_id") == session_id and e.get("type") == "violation"]
    allowed = [e for e in log if e.get("session_id") == session_id and e.get("type") == "allowed"]

    print("=" * 60)
    print(f"Scan Report — slice: {slice_name}")
    print("=" * 60)
    print(f"Allowed reads : {len(allowed)}")
    print(f"Violations    : {len(violations)}")

    if violations:
        print("\nViolations (files read outside allowed paths):")
        for v in violations:
            print(f"  [{v['ts']}] {v['file_path']}")

        print("\nLearning suggestions:")
        print("  For each violation above, ask:")
        print("  1. Why did the AI read this file?")
        print("  2. What pattern was it looking for?")
        print("  3. Is that pattern already in TODO_CONTEXT.md?")
        print("  4. If not → add it to the TODO_CONTEXT template in evdb_scaffold.py")
        print("     or add a convention to SKILL.md under 'Key Conventions'.")
        print("  Goal: encode the answer so the next run needs zero scans.")
    else:
        print("\nZero violations — this slice was implemented without scanning existing code.")

    print("=" * 60)


def cmd_clear(_args: argparse.Namespace) -> None:
    if SCAN_LOG.exists():
        SCAN_LOG.unlink()
    print("[scan-session] Scan log cleared.")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Manage evdb-dev-v2 scan sessions")
    sub = parser.add_subparsers(dest="command", required=True)

    p_start = sub.add_parser("start", help="Start a scan session for a slice")
    p_start.add_argument("--slice", required=True, help="Slice folder name (e.g. funddeposit)")
    p_start.add_argument("--context", required=True, help="Business context (e.g. Funds)")
    p_start.add_argument("--root", default=".", help="Project root (default: .)")

    sub.add_parser("stop", help="Stop the active scan session")
    sub.add_parser("status", help="Show session status and violation count")
    sub.add_parser("assert", help="Exit 1 if any violations exist (use in CI)")
    sub.add_parser("report", help="Print full report with learning suggestions")
    sub.add_parser("clear", help="Clear the scan log")

    args = parser.parse_args()

    commands = {
        "start": cmd_start,
        "stop": cmd_stop,
        "status": cmd_status,
        "assert": cmd_assert,
        "report": cmd_report,
        "clear": cmd_clear,
    }

    commands[args.command](args)


if __name__ == "__main__":
    main()
