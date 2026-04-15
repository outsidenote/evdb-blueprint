#!/usr/bin/env python3
"""Stage: Finalize audit — seal the audit log with a hash chain.

Usage:
    python3 .ci/stages/finalize_audit.py --run-id 12345
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.contracts import AUDIT_BUNDLE, write_json
from lib.audit import seal


def main():
    parser = argparse.ArgumentParser(description="Seal audit bundle")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--previous-hash", default=None)
    args = parser.parse_args()

    bundle = seal(args.run_id, args.previous_hash)
    write_json(AUDIT_BUNDLE, bundle)

    print(f"Sealed audit: {bundle['event_count']} events, hash={bundle['sha256'][:12]}...",
          file=sys.stderr)


if __name__ == "__main__":
    main()
