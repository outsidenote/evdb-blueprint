#!/usr/bin/env python3
"""
stamp_hash.py — Stamps the implementation hash for a slice after successful implementation.

Called at the end of the evdb-dev-v2 pipeline (after scaffold + AI fill + tests pass).
Records the spec version (slice.json content hash) so the diff can detect future spec drift.

Hashes are stored per-context at .implementation-hashes/<Context>.json to avoid
merge conflicts when multiple developers work on different contexts in parallel.

Usage:
  python3 stamp_hash.py --root . --slice <folder>
"""

import argparse
import hashlib
import json
from pathlib import Path


def normalize(obj):
    if isinstance(obj, dict):
        return {k: normalize(v) for k, v in sorted(obj.items())}
    if isinstance(obj, list):
        normalized = [normalize(item) for item in obj]
        if not normalized:
            return normalized
        if isinstance(normalized[0], dict):
            for key in ("name", "id", "title"):
                if key in normalized[0]:
                    return sorted(normalized, key=lambda x: str(x.get(key, "")))
            return sorted(normalized, key=lambda x: json.dumps(x, sort_keys=True))
        try:
            return sorted(normalized)
        except TypeError:
            return normalized
    return obj


def main():
    parser = argparse.ArgumentParser(description="Stamp implementation hash for a slice")
    parser.add_argument("--root", default=".", help="Project root")
    parser.add_argument("--slice", required=True, help="Slice folder name")
    args = parser.parse_args()

    root = Path(args.root).resolve()

    for em_dir in [".eventmodel", ".eventmodel2"]:
        idx_path = root / em_dir / ".slices" / "index.json"
        if not idx_path.exists():
            continue
        idx = json.load(open(idx_path))
        for s in idx["slices"]:
            if s["folder"] == args.slice:
                slice_id = str(s["id"])
                context = s["context"]
                folder = s["folder"]

                slice_json = root / em_dir / ".slices" / context / folder / "slice.json"
                if not slice_json.exists():
                    print(f"[stamp-hash] slice.json not found: {slice_json}")
                    return

                excluded = {"status", "index"}
                spec = json.load(open(slice_json))
                spec = {k: v for k, v in spec.items() if k not in excluded}

                current_hash = hashlib.md5(
                    json.dumps(normalize(spec), sort_keys=True, separators=(",", ":")).encode()
                ).hexdigest()

                # Per-context hash file
                hashes_dir = root / ".implementation-hashes"
                hashes_dir.mkdir(exist_ok=True)
                hashes_path = hashes_dir / f"{context}.json"

                stored = {}
                if hashes_path.exists():
                    try:
                        stored = json.load(open(hashes_path))
                    except Exception:
                        stored = {}

                stored[slice_id] = current_hash
                hashes_path.write_text(json.dumps(stored, indent=2) + "\n")
                print(f"[stamp-hash] {context}/{folder}: {current_hash}")
                return

    print(f"[stamp-hash] Slice '{args.slice}' not found in any index.json")


if __name__ == "__main__":
    main()
