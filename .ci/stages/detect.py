#!/usr/bin/env python3
"""Stage: Detect event model directory and gate on config hash change.

Replaces inline YAML logic + config_hash.py.

Exit 0 always — sets GITHUB_OUTPUT to control downstream steps.

Usage:
    python3 .ci/stages/detect.py \
        --em-dir "" \
        --event-name push \
        --before abc123 \
        --mode live
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.contracts import set_output
from lib.audit import emit


# ── Config hash (absorbs .ci/config_hash.py) ────────────────────

def config_hash(config_path: Path | str) -> str:
    """Content-based hash of config.json, ignoring status/index fields.

    If path is '-', reads from stdin (for git show piping).
    """
    if str(config_path) == "-":
        content = sys.stdin.read()
    else:
        p = Path(config_path)
        if not p.exists():
            return ""
        content = p.read_text()

    try:
        data = json.loads(content)
    except (json.JSONDecodeError, ValueError):
        return ""

    # Normalize: remove fields that change without semantic impact
    if isinstance(data, dict):
        data.pop("status", None)
        data.pop("index", None)
        data.pop("lastModified", None)

    normalized = json.dumps(data, sort_keys=True, separators=(",", ":"))
    return hashlib.md5(normalized.encode()).hexdigest()


# ── Event model directory detection ──────────────────────────────

def detect_em_dir(explicit: str, before_sha: str) -> str:
    """Detect which event model directory changed.

    Priority: explicit input > git diff detection > default.
    """
    if explicit:
        return explicit

    if before_sha and before_sha != "0" * 40:
        try:
            result = subprocess.run(
                ["git", "diff", "--name-only", before_sha, "HEAD"],
                capture_output=True, text=True,
            )
            if ".eventmodel2/" in result.stdout:
                return ".eventmodel2"
        except Exception:
            pass

    return ".eventmodel"


# ── Gate: did config.json actually change? ───────────────────────

def gate_config_changed(em_dir: str, event_name: str, before_sha: str) -> bool:
    """Return True if config.json semantically changed."""
    config_path = Path(em_dir) / "config.json"

    if not config_path.exists():
        return False  # deleted or missing — nothing to process

    if event_name == "workflow_dispatch":
        return True  # manual trigger always proceeds

    new_hash = config_hash(config_path)

    # Get old hash from git
    effective_before = before_sha if before_sha and before_sha != "0" * 40 else None
    ref = effective_before or "HEAD~1"
    try:
        result = subprocess.run(
            ["git", "show", f"{ref}:{em_dir}/config.json"],
            capture_output=True, text=True,
        )
        old_hash = config_hash("-") if result.returncode != 0 else ""
        if result.returncode == 0:
            # Re-hash from the old content
            old_data = result.stdout
            try:
                parsed = json.loads(old_data)
                parsed.pop("status", None)
                parsed.pop("index", None)
                parsed.pop("lastModified", None)
                norm = json.dumps(parsed, sort_keys=True, separators=(",", ":"))
                old_hash = hashlib.md5(norm.encode()).hexdigest()
            except (json.JSONDecodeError, ValueError):
                old_hash = ""
    except Exception:
        old_hash = ""

    return old_hash != new_hash


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Detect EM dir + gate config change")
    parser.add_argument("--em-dir", default="")
    parser.add_argument("--event-name", default="push")
    parser.add_argument("--before", default="")
    parser.add_argument("--mode", default="live", choices=["live", "simulate"])
    args = parser.parse_args()

    em_dir = detect_em_dir(args.em_dir, args.before)
    changed = gate_config_changed(em_dir, args.event_name, args.before)

    # Audit
    emit("config_gate", "detect.py",
         data={"em_dir": em_dir, "changed": changed, "trigger": args.event_name})

    # Outputs
    set_output("em_dir", em_dir)
    set_output("changed", str(changed).lower())
    set_output("mode", args.mode)

    print(f"EM dir: {em_dir}")
    print(f"Changed: {changed}")
    print(f"Mode: {args.mode}")


if __name__ == "__main__":
    main()
