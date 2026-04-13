#!/usr/bin/env python3
"""
CI orchestrator: split config -> diff -> scaffold -> list planned slices per context.

This script handles the deterministic parts of the pipeline.
Claude Code is invoked separately (by the GitHub Action) for business logic.

Usage:
  python3 generate_slices.py --root <project-root>
  python3 generate_slices.py --root <project-root> --em-dir .eventmodel2
  python3 generate_slices.py --root <project-root> --base-branch feature_branch
  python3 generate_slices.py --root <project-root> --context Funds

Output (JSON):
  {
    "contexts": {
      "Funds": {
        "planned_slices": ["funddeposit", ...],
        "scaffolded": ["funddeposit", ...],
        "branch": "feature_branch-codegen/Funds",
        "split_files": [".eventmodel2/.slices/Funds/funddeposit/slice.json", ...]
      }
    },
    "total_planned": 8,
    "total_scaffolded": 8
  }
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path


SCRIPTS_DIR = Path(__file__).parent
SKILLS_DIR = SCRIPTS_DIR.parent / "skills"

SCAFFOLDABLE_STATUSES = {"Planned", "Created"}


def run_script(script: Path, args: list[str], root: Path) -> subprocess.CompletedProcess:
    """Run a Python script and return the result."""
    cmd = [sys.executable, str(script)] + args
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(root))
    if result.returncode != 0:
        print(f"ERROR running {script.name}: {result.stderr}", file=sys.stderr)
    return result


def get_planned_slices_by_context(
    root: Path, em_dir: str = ".eventmodel", filter_context: str | None = None
) -> dict[str, list[dict]]:
    """Read index.json and group scaffoldable slices by context.

    Returns dict of context -> list of slice info dicts.
    """
    index_path = root / em_dir / ".slices" / "index.json"
    if not index_path.exists():
        return {}

    with open(index_path) as f:
        index_data = json.load(f)

    contexts: dict[str, list[dict]] = {}
    for s in index_data.get("slices", []):
        if s.get("status") not in SCAFFOLDABLE_STATUSES:
            continue
        ctx = s.get("context", "Unknown")
        if filter_context and ctx != filter_context:
            continue
        if ctx not in contexts:
            contexts[ctx] = []
        contexts[ctx].append({
            "folder": s["folder"],
            "slice_json": f"{em_dir}/.slices/{ctx}/{s['folder']}/slice.json",
        })

    return contexts


def pascal_case(s: str) -> str:
    """Convert 'Fraud Analysis' to 'FraudAnalysis'."""
    return "".join(w.capitalize() for w in s.split())


def main():
    parser = argparse.ArgumentParser(description="CI orchestrator for evdb code generation")
    parser.add_argument("--root", default=".", help="Project root")
    parser.add_argument("--em-dir", default=".eventmodel", help="Event model directory (default: .eventmodel)")
    parser.add_argument("--base-branch", default=None, help="Base branch name for codegen branches (e.g. feature_branch)")
    parser.add_argument("--skip-split", action="store_true", help="Skip config.json splitting")
    parser.add_argument("--context", default=None, help="Only process a specific context")
    parser.add_argument("--skip-scaffold", action="store_true", help="Skip scaffold (diff only)")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    em_dir = args.em_dir
    base_branch = args.base_branch or "main"

    # Step 1: Split config.json into per-slice files (skip if already split)
    if not args.skip_split:
        config_path = root / em_dir / "config.json"
        slices_index = root / em_dir / ".slices" / "index.json"
        if config_path.exists() and not slices_index.exists():
            print("=== Step 1: Splitting config.json ===", file=sys.stderr)
            split_script = SCRIPTS_DIR / "split_config.py"
            result = run_script(split_script, ["--root", str(root), "--config", str(config_path)], root)
            if result.returncode != 0:
                print("Split failed", file=sys.stderr)
                sys.exit(1)
            print(result.stdout, file=sys.stderr)
        else:
            print("=== Step 1: Skipped (slices already split) ===", file=sys.stderr)

    # Step 2: Run evdb-diff to audit statuses
    print("=== Step 2: Running evdb-diff ===", file=sys.stderr)
    diff_script = SKILLS_DIR / "evdb-diff" / "scripts" / "evdb_diff.py"
    result = run_script(diff_script, ["--root", str(root)], root)
    if result.returncode != 0:
        print("evdb-diff failed", file=sys.stderr)
        sys.exit(1)
    print(result.stdout, file=sys.stderr)

    # Step 3: Identify scaffoldable slices per context
    planned_by_context = get_planned_slices_by_context(root, em_dir, args.context)

    if not planned_by_context:
        print("No planned slices found. Nothing to generate.", file=sys.stderr)
        output = {"contexts": {}, "total_planned": 0, "total_scaffolded": 0, "base_branch": base_branch}
        print(json.dumps(output, indent=2))
        sys.exit(0)

    print(f"\nPlanned slices by context:", file=sys.stderr)
    for ctx, slice_infos in planned_by_context.items():
        folders = [s["folder"] for s in slice_infos]
        print(f"  {ctx}: {', '.join(folders)}", file=sys.stderr)

    # Step 4: Run evdb-scaffold for all planned slices
    output = {"contexts": {}, "total_planned": 0, "total_scaffolded": 0, "base_branch": base_branch}

    scaffold_script = SKILLS_DIR / "evdb-scaffold" / "scripts" / "evdb_scaffold.py"

    for ctx, slice_infos in planned_by_context.items():
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

        if not args.skip_scaffold:
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

    # Output JSON result for the GitHub Action to consume
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
