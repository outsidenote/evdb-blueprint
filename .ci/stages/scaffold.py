#!/usr/bin/env python3
"""Stage: Split → Diff → Scaffold → Normalize → Plan matrix.

Wraps the existing generate_slices.py orchestrator and absorbs
plan_matrix.py into a single stage.

Usage:
    python3 .ci/stages/scaffold.py \
        --root . \
        --em-dir .eventmodel \
        --base-branch main \
        --context ""
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.contracts import (
    GENERATE_OUTPUT, NORMALIZE_SCRIPT,
    SKILLS_DIR, load_json, write_json, set_output,
)
from lib.audit import emit

SCRIPTS_DIR = Path(__file__).resolve().parent.parent.parent / ".claude" / "scripts"
SCAFFOLDABLE_STATUSES = {"Planned", "Created"}
# Slices with these statuses should be scaffolded if files are missing on disk
SCAFFOLD_IF_MISSING_STATUSES = {"Done", "Review"}


def run_script(script: Path, args: list[str], root: Path) -> subprocess.CompletedProcess:
    cmd = [sys.executable, str(script)] + args
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(root))
    if result.returncode != 0:
        print(f"ERROR running {script.name}: {result.stderr}", file=sys.stderr)
    return result


def pascal_case(s: str) -> str:
    return "".join(w.capitalize() for w in s.split())


def _slice_files_exist(root: Path, context: str, folder: str) -> bool:
    """Check if a slice has any scaffolded files on disk."""
    ctx_pascal = pascal_case(context)
    slice_dir = root / "src" / "BusinessCapabilities" / ctx_pascal / "slices"
    if not slice_dir.exists():
        return False
    # Case-insensitive match (folder is lowercase, dirs are PascalCase)
    for d in slice_dir.iterdir():
        if d.is_dir() and d.name.lower() == folder.lower():
            return True
    return False


def get_planned_slices_by_context(
    root: Path, em_dir: str, filter_context: str | None = None,
) -> dict[str, list[dict]]:
    index_path = root / em_dir / ".slices" / "index.json"
    if not index_path.exists():
        return {}

    index_data = json.loads(index_path.read_text())
    contexts: dict[str, list[dict]] = {}

    for s in index_data.get("slices", []):
        status = s.get("status", "")
        ctx = s.get("context", "Unknown")
        folder = s["folder"]

        if filter_context and ctx != filter_context:
            continue

        # Always scaffold Planned/Created slices
        if status in SCAFFOLDABLE_STATUSES:
            contexts.setdefault(ctx, []).append({
                "folder": folder,
                "slice_json": f"{em_dir}/.slices/{ctx}/{folder}/slice.json",
            })
        # Also scaffold Done/Review slices if their files are missing on disk
        elif status in SCAFFOLD_IF_MISSING_STATUSES:
            if not _slice_files_exist(root, ctx, folder):
                print(f"  {folder}: status={status} but files missing — will scaffold",
                      file=sys.stderr)
                contexts.setdefault(ctx, []).append({
                    "folder": folder,
                    "slice_json": f"{em_dir}/.slices/{ctx}/{folder}/slice.json",
                })

    return contexts


def main():
    parser = argparse.ArgumentParser(description="Split → Diff → Scaffold → Plan matrix")
    parser.add_argument("--root", default=".")
    parser.add_argument("--em-dir", default=".eventmodel")
    parser.add_argument("--base-branch", default="main")
    parser.add_argument("--context", default="")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    em_dir = args.em_dir
    base_branch = args.base_branch
    filter_context = args.context or None

    # ── Step 1: Split config.json ────────────────────────────
    config_path = root / em_dir / "config.json"
    slices_index = root / em_dir / ".slices" / "index.json"
    split_script = SCRIPTS_DIR / "split_config.py"

    if config_path.exists() and not slices_index.exists() and split_script.exists():
        print("=== Step 1: Splitting config.json ===", file=sys.stderr)
        result = run_script(split_script, ["--root", str(root), "--config", str(config_path)], root)
        if result.returncode != 0:
            print("Split failed", file=sys.stderr)
            sys.exit(1)
        print(result.stdout, file=sys.stderr)
    else:
        print("=== Step 1: Skipped (already split or no config) ===", file=sys.stderr)

    # ── Step 2: evdb-diff ────────────────────────────────────
    print("=== Step 2: Running evdb-diff ===", file=sys.stderr)
    diff_script = SKILLS_DIR / "evdb-diff" / "scripts" / "evdb_diff.py"
    result = run_script(diff_script, ["--root", str(root)], root)
    if result.returncode != 0:
        print("evdb-diff failed", file=sys.stderr)
        sys.exit(1)
    print(result.stdout, file=sys.stderr)

    # ── Step 3: Identify planned slices ──────────────────────
    planned = get_planned_slices_by_context(root, em_dir, filter_context)

    if not planned:
        print("No planned slices found.", file=sys.stderr)
        output = {"contexts": {}, "total_planned": 0, "total_scaffolded": 0, "base_branch": base_branch}
        write_json(GENERATE_OUTPUT, output)
        set_output("has_contexts", "false")
        return

    print(f"\nPlanned slices:", file=sys.stderr)
    for ctx, infos in planned.items():
        print(f"  {ctx}: {', '.join(s['folder'] for s in infos)}", file=sys.stderr)

    # ── Step 4: Scaffold ─────────────────────────────────────
    scaffold_script = SKILLS_DIR / "evdb-scaffold" / "scripts" / "evdb_scaffold.py"
    output = {"contexts": {}, "total_planned": 0, "total_scaffolded": 0, "base_branch": base_branch}

    for ctx, slice_infos in planned.items():
        folders = [s["folder"] for s in slice_infos]
        split_files = [s["slice_json"] for s in slice_infos]
        ctx_pascal = pascal_case(ctx)

        ctx_result = {
            "planned_slices": folders,
            "scaffolded": [],
            "branch": f"{base_branch}-codegen/{ctx_pascal}-{datetime.now().strftime('%Y%m%d-%H%M')}",
            "context_pascal": ctx_pascal,
            "split_files": split_files,
            "index_file": f"{em_dir}/.slices/index.json",
        }

        print(f"\n=== Step 3: Scaffolding {ctx} ===", file=sys.stderr)
        for folder in folders:
            print(f"  Scaffolding {ctx}/{folder}...", file=sys.stderr)
            result = run_script(scaffold_script, ["--root", str(root), "--slice", folder], root)
            if result.returncode == 0:
                ctx_result["scaffolded"].append(folder)
                output["total_scaffolded"] += 1
                print(f"    OK", file=sys.stderr)
            else:
                print(f"    FAILED: {result.stderr[:200]}", file=sys.stderr)

        output["contexts"][ctx] = ctx_result
        output["total_planned"] += len(folders)

    # ── Step 5: Normalize ────────────────────────────────────
    if NORMALIZE_SCRIPT.exists():
        print("\n=== Step 4: Normalizing ===", file=sys.stderr)
        run_script(NORMALIZE_SCRIPT, ["--root", str(root), "--all"], root)

    # ── Write outputs ────────────────────────────────────────
    write_json(GENERATE_OUTPUT, output)

    emit("scaffold_complete", "scaffold.py",
         data={"total_planned": output["total_planned"],
                "total_scaffolded": output["total_scaffolded"],
                "contexts": list(output["contexts"].keys())})

    # Set has_contexts for downstream — policy_decide.py will set the actual matrix
    set_output("has_contexts", str(output["total_planned"] > 0).lower())

    print(f"\nScaffold complete: {output['total_planned']} planned, {output['total_scaffolded']} scaffolded",
          file=sys.stderr)


if __name__ == "__main__":
    main()
