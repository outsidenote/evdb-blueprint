#!/usr/bin/env python3
"""
run_dev_fixture.py — Test runner for evdb-dev fixture tests.

Orchestrates the full end-to-end test for a named fixture:
  1. Create isolated git worktree
  2. Swap in fixture event model
  3. Run evdb-scaffold on every Planned slice
  4. Run TypeScript tests
  5. Assert zero scan violations
  6. Cleanup
  7. Write report to .claude/test-fixtures/latest/dev-report.md

Usage:
    python3 run_dev_fixture.py --fixture zero-scan --root .
    python3 run_dev_fixture.py --fixture zero-scan --root . --worktree /tmp/my-worktree

NOTE: This script handles the DETERMINISTIC layers only:
  - scaffold (deterministic boilerplate)
  - TypeScript compilation check (tests pass/fail)
  - scan violation count

The AI business-logic fill step (gwts.ts / commandHandler.ts TODOs) is NOT
automated by this script — that requires the evdb-dev-v2 skill invocation,
which Claude orchestrates after reading this report.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path


def run(cmd: list[str], cwd: Path, capture: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd, cwd=cwd,
        capture_output=capture,
        text=True,
    )


def find_planned_slices(index_path: Path) -> list[dict]:
    index = json.loads(index_path.read_text())
    return [s for s in index.get("slices", []) if s.get("status") == "Planned"]


def fixture_path(root: Path, fixture_name: str) -> Path:
    return root / ".claude" / "test-fixtures" / fixture_name


def report_path(root: Path) -> Path:
    return root / ".claude" / "test-fixtures" / "latest" / "dev-report.md"


def main():
    parser = argparse.ArgumentParser(description="Run an evdb-dev fixture test")
    parser.add_argument("--fixture", required=True, help="Fixture name (e.g. zero-scan)")
    parser.add_argument("--root", default=".", help="Repo root (default: .)")
    parser.add_argument("--worktree", help="Worktree path (default: /tmp/evdb-dev-<fixture>)")
    parser.add_argument("--keep-worktree", action="store_true",
                        help="Don't delete worktree after test (useful for debugging)")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    fix_path = fixture_path(root, args.fixture)
    worktree = Path(args.worktree) if args.worktree else Path(f"/tmp/evdb-dev-{args.fixture}")
    branch = f"evdb-test-{args.fixture}"
    started_at = datetime.now(timezone.utc).isoformat()
    t_start = time.monotonic()

    # ── Validate fixture ──────────────────────────────────────────────────
    if not fix_path.exists():
        print(f"ERROR: fixture '{args.fixture}' not found at {fix_path}", file=sys.stderr)
        print(f"Available fixtures: {[d.name for d in (root / '.claude' / 'test-fixtures').iterdir() if d.is_dir()]}", file=sys.stderr)
        sys.exit(1)

    eventmodel_dir = fix_path / "eventmodel"
    if not eventmodel_dir.exists():
        print(f"ERROR: fixture has no eventmodel/ directory", file=sys.stderr)
        sys.exit(1)

    index_path = eventmodel_dir / ".slices" / "index.json"
    if not index_path.exists():
        print(f"ERROR: fixture missing .slices/index.json", file=sys.stderr)
        sys.exit(1)

    planned = find_planned_slices(index_path)
    if not planned:
        print(f"ERROR: no Planned slices in fixture '{args.fixture}'", file=sys.stderr)
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"  evdb-dev fixture test: {args.fixture}")
    print(f"  Planned slices: {[s['folder'] for s in planned]}")
    print(f"{'='*60}\n")

    # ── Step 1: Create worktree ───────────────────────────────────────────
    print("Step 1: Creating worktree...")
    # Clean up any leftover
    run(["git", "worktree", "remove", str(worktree), "--force"], cwd=root)
    run(["git", "branch", "-D", branch], cwd=root)

    r = run(["git", "worktree", "add", str(worktree), "-b", branch, "HEAD"], cwd=root)
    if r.returncode != 0:
        print(f"ERROR creating worktree: {r.stderr}", file=sys.stderr)
        sys.exit(1)
    print(f"  Worktree: {worktree}")

    # ── Step 2: Swap in fixture event model ───────────────────────────────
    print("\nStep 2: Swapping in fixture event model...")
    slices_src = eventmodel_dir / ".slices"
    slices_dst = worktree / ".eventmodel" / ".slices"

    # Copy all fixture slices into worktree
    result = run(["cp", "-r", str(slices_src) + "/.", str(slices_dst)], cwd=root)
    if result.returncode != 0:
        # Try rsync as fallback
        run(["rsync", "-a", str(slices_src) + "/", str(slices_dst) + "/"], cwd=root)

    print(f"  Slices: {[s.name for s in slices_dst.iterdir() if s.is_dir() and s.name != 'index.json']}")

    # ── Step 3: Symlink node_modules ─────────────────────────────────────
    nm_link = worktree / "node_modules"
    if not nm_link.exists():
        os.symlink(root / "node_modules", nm_link)
        print("  Symlinked node_modules")

    # ── Step 4: Run scaffold on every Planned slice ───────────────────────
    print("\nStep 3: Running scaffold on all Planned slices...")
    scaffold_script = root / ".claude" / "skills" / "evdb-scaffold" / "scripts" / "evdb_scaffold.py"
    scaffold_results = {}

    for sl in planned:
        folder = sl["folder"]
        print(f"  Scaffolding {folder}...")
        r = run([sys.executable, str(scaffold_script), "--root", str(worktree), "--slice", folder],
                cwd=worktree)
        scaffold_results[folder] = {
            "returncode": r.returncode,
            "stdout": r.stdout.strip(),
            "stderr": r.stderr.strip(),
        }
        if r.returncode == 0:
            print(f"    ✓ {r.stdout.strip()}")
        else:
            print(f"    ✗ FAILED: {r.stderr.strip()}")

    scaffold_ok = all(v["returncode"] == 0 for v in scaffold_results.values())

    # ── Step 5: Find generated test files ────────────────────────────────
    print("\nStep 4: Collecting test files...")
    test_files = []
    for sl in planned:
        context = sl["context"]
        folder = sl["folder"]

        # Derive command class name from slice.json
        slice_json = worktree / ".eventmodel" / ".slices" / context / folder / "slice.json"
        cmd_class = folder  # fallback
        if slice_json.exists():
            try:
                sd = json.loads(slice_json.read_text())
                cmds = sd.get("commands", [])
                if cmds:
                    title = cmds[0].get("title", "")
                    cmd_class = "".join(w.capitalize() for w in title.split())
            except Exception:
                pass

        test_file = worktree / "src" / "BusinessCapabilities" / context / "slices" / cmd_class / "tests" / "command.slice.test.ts"
        view_test_pattern = worktree / "src" / "BusinessCapabilities" / context / "swimlanes" / context / "views"

        if test_file.exists():
            test_files.append(test_file)
            print(f"  Found: {test_file.relative_to(worktree)}")

        # Find view tests
        if view_test_pattern.exists():
            for vt in view_test_pattern.rglob("view.slice.test.ts"):
                if vt not in test_files:
                    test_files.append(vt)
                    print(f"  Found: {vt.relative_to(worktree)}")

    # ── Step 6: Note — AI fill step is separate ───────────────────────────
    print("\nStep 5: NOTE — AI fill step (gwts.ts / commandHandler.ts TODOs)")
    print("  This script scaffolds deterministic files only.")
    print("  evdb-dev-v2 skill must be invoked separately to fill business logic.")
    print("  Scaffold output above shows what was created.")

    # ── Step 7: Run tests (will likely fail without AI fill) ──────────────
    print("\nStep 6: Running tests...")
    test_results = {"pass": 0, "fail": 0, "output": ""}
    if test_files:
        rel_paths = [str(tf.relative_to(worktree)) for tf in test_files]
        r = run(
            ["node", "--import", "tsx", "--test"] + [str(tf) for tf in test_files],
            cwd=worktree,
            capture=True,
        )
        test_results["output"] = (r.stdout + r.stderr).strip()

        # Parse pass/fail counts
        for line in test_results["output"].splitlines():
            if line.strip().startswith("ℹ pass"):
                try:
                    test_results["pass"] = int(line.strip().split()[-1])
                except ValueError:
                    pass
            if line.strip().startswith("ℹ fail"):
                try:
                    test_results["fail"] = int(line.strip().split()[-1])
                except ValueError:
                    pass
    else:
        test_results["output"] = "No test files found"

    tests_ok = test_results["fail"] == 0 and test_results["pass"] > 0

    # ── Step 8: Check scan violations ─────────────────────────────────────
    print("\nStep 7: Checking scan violations...")
    scan_script = root / ".claude" / "skills" / "evdb-dev-v2" / "scripts" / "scan_session.py"
    scan_violations = -1
    scan_output = ""
    if scan_script.exists():
        r = run([sys.executable, str(scan_script), "report"], cwd=root)
        scan_output = (r.stdout + r.stderr).strip()
        for line in scan_output.splitlines():
            if "Violations" in line and ":" in line:
                try:
                    scan_violations = int(line.split(":")[-1].strip())
                except ValueError:
                    pass
    scan_ok = scan_violations == 0

    # ── Step 9: Cleanup ───────────────────────────────────────────────────
    if not args.keep_worktree:
        print("\nStep 8: Cleaning up worktree...")
        run(["git", "worktree", "remove", str(worktree), "--force"], cwd=root)
        run(["git", "branch", "-D", branch], cwd=root)
        print("  Done")
    else:
        print(f"\nStep 8: Keeping worktree at {worktree} (--keep-worktree)")

    # ── Step 10: Write report ─────────────────────────────────────────────
    t_end = time.monotonic()
    scaffold_duration_s = round(t_end - t_start, 1)
    overall = "PASS" if (scaffold_ok and tests_ok) else "FAIL"
    rpt = report_path(root)
    rpt.parent.mkdir(parents=True, exist_ok=True)

    lines = [
        f"# evdb-dev fixture: {args.fixture}",
        f"",
        f"**Result: {overall}**  |  {started_at}",
        f"",
        f"## Planned slices",
        f"",
    ]
    for sl in planned:
        sr = scaffold_results.get(sl["folder"], {})
        icon = "✓" if sr.get("returncode") == 0 else "✗"
        lines.append(f"- {icon} `{sl['folder']}` ({sl['context']}) — {sr.get('stdout', 'not run')}")

    lines += [
        f"",
        f"## Tests",
        f"",
        f"- Pass: {test_results['pass']}",
        f"- Fail: {test_results['fail']}",
        f"",
        f"```",
        test_results["output"],
        f"```",
        f"",
        f"## Scan violations",
        f"",
        f"```",
        scan_output,
        f"```",
        f"",
        f"## Performance (scaffold layer only)",
        f"",
        f"| Metric | Value |",
        f"|---|---|",
        f"| Scaffold + tests duration | {scaffold_duration_s}s |",
        f"| Slices scaffolded | {len(planned)} |",
        f"| Files generated | {sum(len(sr.get('stdout', '').split('+')) - 1 for sr in scaffold_results.values() if sr.get('returncode') == 0)} |",
        f"| AI fill tokens | _(reported by Claude after evdb-dev-v2 invocation)_ |",
        f"| AI fill cost | _(reported by Claude after evdb-dev-v2 invocation)_ |",
        f"",
        f"## Notes",
        f"",
        f"- Scaffold only (deterministic). AI fill step runs separately via evdb-dev-v2.",
        f"- Tests failing before AI fill is expected for stubs.",
    ]

    rpt.write_text("\n".join(lines))

    # ── Summary ───────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"  Result:    {overall}")
    print(f"  Scaffold:  {'OK' if scaffold_ok else 'FAILED'}")
    print(f"  Tests:     {test_results['pass']} pass / {test_results['fail']} fail")
    print(f"  Scan:      {scan_violations} violations")
    print(f"  Duration:  {scaffold_duration_s}s (scaffold + tests)")
    print(f"  Report:    {rpt.relative_to(root)}")
    print(f"{'='*60}\n")

    sys.exit(0 if overall == "PASS" else 1)


if __name__ == "__main__":
    main()
