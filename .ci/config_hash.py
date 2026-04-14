#!/usr/bin/env python3
"""Compute a content hash for config.json (ignoring status/index fields).

Usage:
  python3 .ci/config_hash.py <config.json>          # from file
  cat config.json | python3 .ci/config_hash.py -     # from stdin
"""
import json, hashlib, sys

def compute_hash(data: dict) -> str:
    slices = data.get("slices", [])
    for s in slices:
        s.pop("status", None)
        s.pop("index", None)
    return hashlib.md5(json.dumps(slices, sort_keys=True).encode()).hexdigest()

if __name__ == "__main__":
    source = sys.argv[1] if len(sys.argv) > 1 else "-"
    try:
        if source == "-":
            data = json.load(sys.stdin)
        else:
            with open(source) as f:
                data = json.load(f)
        print(compute_hash(data))
    except Exception:
        print("none")
