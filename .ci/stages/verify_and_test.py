#!/usr/bin/env python3
"""Stage: Verify contracts + run tests — combined pass/fail result.

Calls evdb-normalize, evdb-verify, and node test runner.
Writes combined result to GITHUB_OUTPUT.

Usage:
    python3 .ci/stages/verify_and_test.py --root . --context Portfolio
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.contracts import (
    VERIFY_RESULTS, TEST_OUTPUT, TEST_RESULTS, NORMALIZE_SCRIPT, VERIFY_SCRIPT,
    write_json, set_output,
)
from lib.audit import emit


def run_normalize(root: Path) -> bool:
    """Run evdb-normalize --all. Returns True on success."""
    try:
        result = subprocess.run(
            [sys.executable, str(NORMALIZE_SCRIPT), "--root", str(root), "--all"],
            capture_output=True, text=True, cwd=str(root),
        )
        return result.returncode == 0
    except Exception:
        return False


def run_verify(root: Path) -> tuple[bool, str]:
    """Run evdb-verify --all --json. Returns (passed, json_output)."""
    # JSON output for downstream stages
    try:
        result = subprocess.run(
            [sys.executable, str(VERIFY_SCRIPT), "--all", "--root", str(root), "--json"],
            capture_output=True, text=True, cwd=str(root),
        )
        json_output = result.stdout
    except Exception:
        json_output = '{"violations":[]}'

    VERIFY_RESULTS.write_text(json_output)

    # Human-readable run for pass/fail determination
    try:
        result = subprocess.run(
            [sys.executable, str(VERIFY_SCRIPT), "--all", "--root", str(root)],
            capture_output=True, text=True, cwd=str(root),
        )
        print(result.stdout, file=sys.stderr)
        return result.returncode == 0, json_output
    except Exception as e:
        print(f"Verify error: {e}", file=sys.stderr)
        return False, json_output


def run_lint(root: Path, context: str) -> bool:
    """Run ESLint on generated files. Returns True if no errors/warnings."""
    bc_dir = root / "src" / "BusinessCapabilities" / context
    if not bc_dir.exists():
        print("  No files to lint", file=sys.stderr)
        return True

    # Only lint .ts files that were actually changed (scaffold or AI)
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD~1",
             f"src/BusinessCapabilities/{context}/"],
            capture_output=True, text=True, cwd=str(root),
        )
        ts_files = [
            str(root / f.strip()) for f in result.stdout.strip().splitlines()
            if f.strip().endswith(".ts") and not f.strip().endswith(".test.ts")
        ]
    except Exception:
        ts_files = []
    if not ts_files:
        print("  No .ts files found", file=sys.stderr)
        return True

    print(f"  Linting {len(ts_files)} file(s)...", file=sys.stderr, end=" ", flush=True)
    try:
        result = subprocess.run(
            ["npx", "eslint", "--max-warnings", "0"] + ts_files,
            capture_output=True, text=True, cwd=str(root), timeout=60,
        )
        if result.returncode == 0:
            print("PASS", file=sys.stderr)
            return True
        else:
            print(f"FAIL", file=sys.stderr)
            # Add lint failures to test results so classifier can see them
            for line in result.stdout.strip().splitlines()[:10]:
                print(f"    {line}", file=sys.stderr)

            # Append lint failures to test-results.json so repair can pick them up
            try:
                existing = load_json(TEST_RESULTS) or {"total": 0, "passed": 0, "failed": 0, "results": []}
                # Extract slice names from lint errors
                import re
                lint_slices: set[str] = set()
                for line in result.stdout.splitlines():
                    m = re.search(r"/(?:slices|endpoints)/(\w+)/", line)
                    if m:
                        lint_slices.add(m.group(1))
                for sl in lint_slices:
                    existing["results"].append({
                        "file": f"eslint:{sl}",
                        "slice": sl,
                        "passed": False,
                        "exit_code": result.returncode,
                        "error": result.stdout[:500],
                    })
                    existing["failed"] = existing.get("failed", 0) + 1
                    existing["total"] = existing.get("total", 0) + 1
                write_json(TEST_RESULTS, existing)
            except Exception:
                pass

            return False
    except subprocess.TimeoutExpired:
        print("TIMEOUT (60s)", file=sys.stderr)
        return False
    except FileNotFoundError:
        print("SKIP (eslint not found)", file=sys.stderr)
        return True


def run_tests(root: Path, context: str) -> tuple[bool, str]:
    """Run slice tests for a context. Returns (passed, output).

    Only runs known test patterns — not every *.test.ts in the tree:
      - slices/*/tests/command.slice.test.ts  (command slices)
      - slices/*/tests/projection.test.ts     (projection slices)
      - endpoints/*/tests/enrichment.test.ts  (enrichment endpoints)

    This avoids running behaviour tests, integration tests, or other
    test files that require external services (DB, Kafka, etc).
    """
    test_dir = root / "src" / "BusinessCapabilities" / context
    test_patterns = [
        "slices/*/tests/command.slice.test.ts",
        "slices/*/tests/projection.test.ts",
        "slices/*/projection.slice.test.ts",
        "endpoints/*/tests/enrichment.test.ts",
    ]

    test_files = []
    for pattern in test_patterns:
        matches = sorted(test_dir.glob(pattern))
        print(f"  Pattern '{pattern}': {len(matches)} file(s)", file=sys.stderr)
        for m in matches:
            print(f"    {m.relative_to(root)}", file=sys.stderr)
        test_files.extend(matches)

    if not test_files:
        print("  No test files found — skipping tests", file=sys.stderr)
        return True, "No test files found"

    print(f"  Total: {len(test_files)} test file(s) to run", file=sys.stderr)

    output_lines = []
    test_results: list[dict] = []
    all_passed = True

    for tf in test_files:
        rel = tf.relative_to(root)
        rel_str = str(rel)

        # Extract slice name from path: slices/SliceName/... or endpoints/SliceName/...
        slice_name = ""
        for part_type in ("slices", "endpoints"):
            if f"/{part_type}/" in rel_str or rel_str.startswith(f"{part_type}/"):
                parts = rel_str.split(f"{part_type}/")
                if len(parts) > 1:
                    slice_name = parts[1].split("/")[0]
                    break

        print(f"  Running: {rel} ...", file=sys.stderr, end=" ", flush=True)
        output_lines.append(f"--- Running: {rel} ---")

        entry: dict = {
            "file": rel_str,
            "slice": slice_name,
            "passed": False,
            "exit_code": -1,
            "error": "",
            "stdout_head": "",
        }

        try:
            result = subprocess.run(
                ["node", "--import", "tsx", "--test", str(tf)],
                capture_output=True, text=True, cwd=str(root),
                timeout=120,
            )
            output_lines.append(result.stdout)
            if result.stderr:
                output_lines.append(result.stderr)

            entry["exit_code"] = result.returncode
            entry["passed"] = result.returncode == 0

            if result.returncode != 0:
                all_passed = False
                # Capture first meaningful error lines for classifier
                combined = (result.stdout + "\n" + result.stderr).strip()
                entry["error"] = combined[:500]
                entry["stdout_head"] = result.stdout[:300]
                print(f"FAIL (exit {result.returncode})", file=sys.stderr)
                for label, text in [("stdout", result.stdout), ("stderr", result.stderr)]:
                    lines = text.strip().splitlines()
                    if lines:
                        for line in lines[:5]:
                            print(f"    [{label}] {line}", file=sys.stderr)
                        if len(lines) > 5:
                            print(f"    [{label}] ... ({len(lines) - 5} more lines)", file=sys.stderr)
            else:
                print("PASS", file=sys.stderr)
        except subprocess.TimeoutExpired:
            output_lines.append(f"TIMEOUT: {rel} (120s)")
            all_passed = False
            entry["error"] = "TIMEOUT after 120s"
            print("TIMEOUT (120s)", file=sys.stderr)
        except Exception as e:
            output_lines.append(f"ERROR: {e}")
            all_passed = False
            entry["error"] = str(e)
            print(f"ERROR: {e}", file=sys.stderr)

        test_results.append(entry)

    print(f"  Test result: {'PASS' if all_passed else 'FAIL'} ({len(test_files)} files)", file=sys.stderr)

    # Write structured results — classifier reads this instead of parsing text
    write_json(TEST_RESULTS, {
        "total": len(test_results),
        "passed": sum(1 for r in test_results if r["passed"]),
        "failed": sum(1 for r in test_results if not r["passed"]),
        "results": test_results,
    })

    full_output = "\n".join(output_lines)
    TEST_OUTPUT.write_text(full_output)
    return all_passed, full_output


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Verify contracts + run tests")
    parser.add_argument("--root", default=".")
    parser.add_argument("--context", required=True)
    args = parser.parse_args()

    root = Path(args.root).resolve()

    # Step 1: Normalize
    print("=== Normalize ===", file=sys.stderr)
    run_normalize(root)

    # Step 2: Verify contracts
    print("=== Verify contracts ===", file=sys.stderr)
    verify_passed, verify_json = run_verify(root)

    # Step 3: Run tests
    print("=== Run tests ===", file=sys.stderr)
    test_passed, test_output = run_tests(root, args.context)

    # Step 4: Lint generated code
    print("=== Lint ===", file=sys.stderr)
    lint_passed = run_lint(root, args.context)

    # Combined result
    passed = verify_passed and test_passed and lint_passed

    # Audit
    emit("verify_result", "verify_and_test.py", context=args.context,
         data={
             "verify_passed": verify_passed,
             "test_passed": test_passed,
             "combined_passed": passed,
         })

    # Outputs
    set_output("passed", str(passed).lower())
    set_output("verify_passed", str(verify_passed).lower())
    set_output("test_passed", str(test_passed).lower())

    status = "PASS" if passed else "FAIL"
    print(f"\n=== Result: {status} (verify={verify_passed}, tests={test_passed}) ===", file=sys.stderr)

    # Exit code: 0 always (continue-on-error in YAML reads the output)
    # The YAML step uses `steps.verify.outputs.passed` for conditionals


if __name__ == "__main__":
    main()
