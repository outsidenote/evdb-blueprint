#!/usr/bin/env python3
"""
scan_guard.py — PostToolUse hook for evdb-dev-v2.

Intercepts every Read tool call during an active scan session and logs
any file path that falls outside the allowed set as a violation.

Claude Code passes the tool call as JSON on stdin:
  {
    "session_id": "...",
    "transcript_path": "...",
    "tool_name": "Read",
    "tool_input": {"file_path": "..."},
    "tool_response": {...}
  }

Violations are logged to .claude/skills/evdb-dev-v2/scan-log.json.
A warning is printed to stdout so Claude sees it inline.
"""
import sys
import json
from datetime import datetime, timezone
from pathlib import Path

SKILLS_DIR = Path(__file__).resolve().parent.parent
SESSION_FILE = SKILLS_DIR / ".scan-session.json"
SCAN_LOG = SKILLS_DIR / "scan-log.json"


def load_session() -> dict:
    if SESSION_FILE.exists():
        try:
            return json.loads(SESSION_FILE.read_text())
        except Exception:
            pass
    return {"active": False}


def is_allowed(file_path: str, session: dict) -> bool:
    """True if the path is within the declared allowed prefixes."""
    # Resolve symlinks so /tmp (→ /private/tmp on macOS) matches stored prefixes
    try:
        resolved = str(Path(file_path).resolve())
    except Exception:
        resolved = file_path
    for prefix in session.get("allowed_prefixes", []):
        if file_path.startswith(prefix) or resolved.startswith(prefix):
            return True
    return False


def append_log(entry: dict) -> None:
    entries: list = []
    if SCAN_LOG.exists():
        try:
            entries = json.loads(SCAN_LOG.read_text())
        except Exception:
            entries = []
    entries.append(entry)
    SCAN_LOG.write_text(json.dumps(entries, indent=2))


def main() -> None:
    raw = sys.stdin.read()
    try:
        data = json.loads(raw)
    except Exception:
        sys.exit(0)

    if data.get("tool_name") != "Read":
        sys.exit(0)

    file_path: str = data.get("tool_input", {}).get("file_path", "")
    if not file_path:
        sys.exit(0)

    session = load_session()
    if not session.get("active"):
        sys.exit(0)

    ts = datetime.now(timezone.utc).isoformat()
    entry = {
        "ts": ts,
        "session_id": session.get("session_id", "unknown"),
        "slice": session.get("slice", "unknown"),
        "file_path": file_path,
    }

    if is_allowed(file_path, session):
        entry["type"] = "allowed"
        append_log(entry)
        sys.exit(0)

    # ── Violation ────────────────────────────────────────────────────
    entry["type"] = "violation"
    append_log(entry)

    # Print a message Claude will see after this tool call completes.
    # This nudges it away from further scans and makes violations visible.
    print(
        f"\n[scan-guard] SCAN VIOLATION: {file_path}\n"
        f"This file is outside the allowed paths for slice '{session.get('slice')}'.\n"
        f"Everything you need is in TODO_CONTEXT.md and the scaffold files.\n"
        f"Do not read existing blueprint code — violation has been logged.\n"
    )

    sys.exit(0)  # PostToolUse cannot block, only warn


if __name__ == "__main__":
    main()
