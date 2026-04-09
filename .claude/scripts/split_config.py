#!/usr/bin/env python3
"""
Split a Miro-exported config.json into per-context/slice structure.

Reads .eventmodel/config.json (single file with all slices) and produces:
  - .eventmodel/.slices/index.json          (registry of all slices)
  - .eventmodel/.slices/<Context>/<folder>/slice.json  (one per slice)

Usage:
  python3 split_config.py --root <project-root>
  python3 split_config.py --root <project-root> --dry-run
  python3 split_config.py --root <project-root> --config <path-to-config.json>
"""

import argparse
import json
import re
import sys
from pathlib import Path


def to_folder_name(title: str) -> str:
    """Convert 'slice: Fund Deposit' to 'funddeposit'."""
    # Strip 'slice: ' prefix
    name = re.sub(r'^slice:\s*', '', title, flags=re.IGNORECASE)
    # Remove special chars, collapse spaces, lowercase
    name = re.sub(r'[^a-zA-Z0-9\s-]', '', name)
    name = name.replace(' ', '').replace('-', '').lower()
    return name


def split_config(root: Path, config_path: Path | None = None, dry_run: bool = False) -> dict:
    """Split config.json into individual slice files and index.json."""

    eventmodel = root / ".eventmodel"
    if config_path is None:
        config_path = eventmodel / "config.json"

    slices_dir = eventmodel / ".slices"
    index_path = slices_dir / "index.json"

    if not config_path.exists():
        print(f"ERROR: config.json not found at {config_path}", file=sys.stderr)
        sys.exit(1)

    with open(config_path) as f:
        config = json.load(f)

    slices = config.get("slices", [])
    if not slices:
        print("WARNING: No slices found in config.json", file=sys.stderr)
        return {"slices_written": 0, "index_entries": 0, "contexts": []}

    # Load existing index to preserve statuses
    existing_statuses: dict[str, str] = {}
    if index_path.exists():
        with open(index_path) as f:
            existing = json.load(f)
        for s in existing.get("slices", []):
            existing_statuses[s["id"]] = s.get("status", "Planned")

    # Group by context
    contexts: dict[str, list] = {}
    index_entries = []

    for i, slice_data in enumerate(slices):
        context = slice_data.get("context", "Unknown")
        title = slice_data.get("title", f"slice-{i}")
        slice_id = slice_data.get("id", str(i))
        folder = to_folder_name(title)

        # Preserve existing status if available, otherwise default to Planned
        status = existing_statuses.get(slice_id, "Planned")

        # Build index entry
        index_entries.append({
            "id": slice_id,
            "slice": title,
            "index": slice_data.get("index", i * 2 + 1),
            "context": context,
            "folder": folder,
            "status": status,
        })

        # Group slice data by context
        if context not in contexts:
            contexts[context] = []
        contexts[context].append((folder, slice_data))

    # Build index
    index_data = {"slices": index_entries}

    result = {
        "slices_written": 0,
        "index_entries": len(index_entries),
        "contexts": list(contexts.keys()),
        "details": [],
    }

    if dry_run:
        print(f"[DRY RUN] Would write index.json with {len(index_entries)} entries")
        for ctx, slice_list in contexts.items():
            for folder, _ in slice_list:
                path = slices_dir / ctx / folder / "slice.json"
                print(f"[DRY RUN] Would write {path.relative_to(root)}")
                result["slices_written"] += 1
        return result

    # Write index.json
    slices_dir.mkdir(parents=True, exist_ok=True)
    with open(index_path, "w") as f:
        json.dump(index_data, f, indent=2)
        f.write("\n")
    print(f"Wrote index.json ({len(index_entries)} slices)")

    # Write individual slice.json files
    for ctx, slice_list in contexts.items():
        for folder, slice_data in slice_list:
            slice_path = slices_dir / ctx / folder / "slice.json"
            slice_path.parent.mkdir(parents=True, exist_ok=True)
            with open(slice_path, "w") as f:
                json.dump(slice_data, f, indent=2)
                f.write("\n")
            result["slices_written"] += 1
            result["details"].append({
                "context": ctx,
                "folder": folder,
                "path": str(slice_path.relative_to(root)),
            })
            print(f"  {ctx}/{folder}/slice.json")

    print(f"\nSplit complete: {result['slices_written']} slices across {len(contexts)} context(s)")
    return result


def main():
    parser = argparse.ArgumentParser(description="Split Miro config.json into per-slice files")
    parser.add_argument("--root", default=".", help="Project root")
    parser.add_argument("--config", default=None, help="Path to config.json (default: .eventmodel/config.json)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be created without writing")
    parser.add_argument("--json", action="store_true", help="Output result as JSON")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    config_path = Path(args.config).resolve() if args.config else None

    result = split_config(root, config_path, args.dry_run)

    if args.json:
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
