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
    VERIFY_RESULTS, TEST_OUTPUT, NORMALIZE_SCRIPT, VERIFY_SCRIPT,
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
        test_files.extend(sorted(test_dir.glob(pattern)))

    if not test_files:
        return True, "No test files found"

    output_lines = []
    all_passed = True

    for tf in test_files:
        rel = tf.relative_to(root)
        output_lines.append(f"--- Running: {rel} ---")
        try:
            result = subprocess.run(
                ["node", "--import", "tsx", "--test", str(tf)],
                capture_output=True, text=True, cwd=str(root),
                timeout=120,
            )
            output_lines.append(result.stdout)
            if result.stderr:
                output_lines.append(result.stderr)
            if result.returncode != 0:
                all_passed = False
        except subprocess.TimeoutExpired:
            output_lines.append(f"TIMEOUT: {rel}")
            all_passed = False
        except Exception as e:
            output_lines.append(f"ERROR: {e}")
            all_passed = False

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

    # Combined result
    passed = verify_passed and test_passed

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
