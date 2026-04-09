#!/usr/bin/env python3
"""
classify_failure.py — Deterministic failure classifier for evdb CI pipeline.

Parses verify JSON output, test output, and optional compiler output to classify
failures into actionable categories. Uses regex/rules first; AI fallback only
as last resort for truly unknown failures.

Exit codes:
  0 — classification complete (even if failures found)
  1 — bad input / internal error

Usage:
  python3 classify_failure.py --verify /tmp/verify-results.json --test-output /tmp/test-output.txt
  python3 classify_failure.py --verify /tmp/verify-results.json --context Funds
"""

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path


# ---------------------------------------------------------------------------
# Failure classes
# ---------------------------------------------------------------------------

TYPE_ERROR = "type_error"
IMPORT_ERROR = "import_error"
PATH_ERROR = "path_error"
PREDICATE_MISMATCH = "predicate_mismatch"
MISSING_HANDLER_BRANCH = "missing_handler_branch"
VERIFICATION_FAILURE = "verification_failure"
TEST_FAILURE = "test_failure"
FLAKY_OR_ENV = "flaky_or_env"
UNKNOWN = "unknown"


@dataclass
class SliceClassification:
    slice_name: str
    failure_class: str
    details: list[str] = field(default_factory=list)
    affected_files: list[str] = field(default_factory=list)
    deterministic: bool = True

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Verify output parsing
# ---------------------------------------------------------------------------

def classify_verify_failures(verify_data: list[dict]) -> list[SliceClassification]:
    """Classify failures from verify --json --all output.

    verify_data is a list of per-slice summaries:
      [{"slice": "X", "passed": false, "fail_count": 2, "warn_count": 1, "checks": [...]}]
    OR a flat list when --json is used with a single slice.
    """
    results = []

    for entry in verify_data:
        slice_name = entry.get("slice", "unknown")
        if entry.get("passed", True):
            continue  # no failure to classify

        checks = entry.get("checks", [])
        failed_checks = [c for c in checks if c["status"] in ("FAIL", "MISSING")]

        if not failed_checks:
            continue

        classification = _classify_checks(slice_name, failed_checks)
        results.append(classification)

    return results


def _classify_checks(slice_name: str, failed_checks: list[dict]) -> SliceClassification:
    """Classify a set of failed checks into a single failure class."""
    missing_files = [c for c in failed_checks if c["status"] == "MISSING"]
    fail_checks = [c for c in failed_checks if c["status"] == "FAIL"]

    affected_files = list({c["file"] for c in failed_checks})
    details = [f"{c['check']}: {c.get('detail', '')}" for c in failed_checks]

    # Priority 1: Missing files → path_error
    if missing_files:
        return SliceClassification(
            slice_name=slice_name,
            failure_class=PATH_ERROR,
            details=[f"MISSING: {c['file']}" for c in missing_files],
            affected_files=[c["file"] for c in missing_files],
        )

    # Priority 2: Check for specific failure patterns
    predicate_failures = [c for c in fail_checks if "predicate" in c["check"]]
    handler_failures = [c for c in fail_checks if "appends_" in c["check"]]
    type_failures = [c for c in fail_checks if "field_" in c["check"]]
    import_failures = [c for c in fail_checks
                       if "import" in c["check"] or "handler_import" in c["check"]]

    # Import errors
    if import_failures and not predicate_failures and not handler_failures:
        return SliceClassification(
            slice_name=slice_name,
            failure_class=IMPORT_ERROR,
            details=details,
            affected_files=affected_files,
        )

    # Type mismatches (field declarations wrong)
    if type_failures and not predicate_failures and not handler_failures:
        return SliceClassification(
            slice_name=slice_name,
            failure_class=TYPE_ERROR,
            details=details,
            affected_files=affected_files,
        )

    # Predicate mismatch
    if predicate_failures:
        return SliceClassification(
            slice_name=slice_name,
            failure_class=PREDICATE_MISMATCH,
            details=details,
            affected_files=[f for f in affected_files if "gwts" in f],
        )

    # Missing handler branches (appendEvent calls missing)
    if handler_failures:
        return SliceClassification(
            slice_name=slice_name,
            failure_class=MISSING_HANDLER_BRANCH,
            details=details,
            affected_files=[f for f in affected_files if "commandHandler" in f],
        )

    # Generic verification failure
    return SliceClassification(
        slice_name=slice_name,
        failure_class=VERIFICATION_FAILURE,
        details=details,
        affected_files=affected_files,
    )


# ---------------------------------------------------------------------------
# Test output parsing
# ---------------------------------------------------------------------------

# Patterns for flaky/env failures
FLAKY_PATTERNS = [
    re.compile(r"ETIMEOUT", re.IGNORECASE),
    re.compile(r"ECONNREFUSED", re.IGNORECASE),
    re.compile(r"ECONNRESET", re.IGNORECASE),
    re.compile(r"heap out of memory", re.IGNORECASE),
    re.compile(r"JavaScript heap", re.IGNORECASE),
    re.compile(r"ENOMEM", re.IGNORECASE),
    re.compile(r"killed\s+npm", re.IGNORECASE),
    re.compile(r"timed?\s*out", re.IGNORECASE),
    re.compile(r"segmentation fault", re.IGNORECASE),
    re.compile(r"SIGKILL|SIGTERM", re.IGNORECASE),
]

# Patterns for TypeScript compiler errors
TS_ERROR_PATTERNS = [
    re.compile(r"TS(\d{4})"),  # TypeScript error codes
    re.compile(r"error TS\d{4}:"),
    re.compile(r"Cannot find module", re.IGNORECASE),
    re.compile(r"Module '.*' has no exported member", re.IGNORECASE),
    re.compile(r"Type '.*' is not assignable to type", re.IGNORECASE),
    re.compile(r"Property '.*' does not exist on type", re.IGNORECASE),
]

# Patterns for import-specific errors
IMPORT_PATTERNS = [
    re.compile(r"Cannot find module '([^']+)'"),
    re.compile(r"TS2307"),  # Cannot find module
    re.compile(r"TS2305"),  # Module has no exported member
    re.compile(r"ERR_MODULE_NOT_FOUND"),
]

# Pattern to extract failing test slice name
TEST_SLICE_PATTERN = re.compile(
    r"(?:FAIL|not ok|✗)\s+.*?BusinessCapabilities/(\w+)/slices/(\w+)"
)


def classify_test_output(test_output: str, already_classified: set[str]) -> list[SliceClassification]:
    """Classify failures from test runner stdout/stderr.

    already_classified: set of slice names already classified by verify.
    """
    results = []

    # Check for flaky/env issues first (affects all slices)
    for pattern in FLAKY_PATTERNS:
        if pattern.search(test_output):
            return [SliceClassification(
                slice_name="__all__",
                failure_class=FLAKY_OR_ENV,
                details=[f"Environment issue detected: {pattern.pattern}"],
                affected_files=[],
            )]

    # Check for TypeScript/import errors in test output
    has_ts_errors = any(p.search(test_output) for p in TS_ERROR_PATTERNS)
    has_import_errors = any(p.search(test_output) for p in IMPORT_PATTERNS)

    # Extract per-slice test failures
    failing_slices = set()
    for match in TEST_SLICE_PATTERN.finditer(test_output):
        context, slice_name = match.group(1), match.group(2)
        failing_slices.add(slice_name)

    # Also check for "# fail N" patterns from Node test runner
    if not failing_slices:
        # Try to find failed test files
        file_fail_pattern = re.compile(
            r"not ok \d+.*?(\w+)\.slice\.test"
        )
        for match in file_fail_pattern.finditer(test_output):
            failing_slices.add(match.group(1))

    for slice_name in failing_slices:
        if slice_name in already_classified:
            continue  # verify already classified this one

        if has_import_errors:
            failure_class = IMPORT_ERROR
        elif has_ts_errors:
            failure_class = TYPE_ERROR
        else:
            failure_class = TEST_FAILURE

        results.append(SliceClassification(
            slice_name=slice_name,
            failure_class=failure_class,
            details=[_extract_test_error_context(test_output, slice_name)],
            affected_files=[],
        ))

    # If tests failed but we couldn't identify specific slices
    if not results and not failing_slices and "# fail" in test_output:
        results.append(SliceClassification(
            slice_name="__all__",
            failure_class=TEST_FAILURE,
            details=["Test failures detected but could not identify specific slices"],
            affected_files=[],
        ))

    return results


def _extract_test_error_context(output: str, slice_name: str, context_lines: int = 5) -> str:
    """Extract a few lines around the failing test for diagnostics."""
    lines = output.split("\n")
    for i, line in enumerate(lines):
        if slice_name in line and ("FAIL" in line or "not ok" in line or "✗" in line):
            start = max(0, i - 1)
            end = min(len(lines), i + context_lines)
            return "\n".join(lines[start:end])
    return f"Test failure for {slice_name} (no context extracted)"


# ---------------------------------------------------------------------------
# Compiler output parsing (optional)
# ---------------------------------------------------------------------------

def classify_compiler_output(compiler_output: str, already_classified: set[str]) -> list[SliceClassification]:
    """Classify failures from tsc output."""
    results = []

    # Extract TS errors with file locations
    ts_error_re = re.compile(
        r"(src/BusinessCapabilities/(\w+)/(?:slices|swimlanes)/.*?\.ts)"
        r"\(\d+,\d+\):\s*error (TS\d{4}):\s*(.*)"
    )

    by_slice: dict[str, list[tuple[str, str, str]]] = {}
    for match in ts_error_re.finditer(compiler_output):
        filepath, context, error_code, message = match.groups()
        # Extract slice name from path
        parts = filepath.split("/")
        slice_idx = next((i for i, p in enumerate(parts) if p == "slices"), None)
        if slice_idx and slice_idx + 1 < len(parts):
            slice_name = parts[slice_idx + 1]
        else:
            slice_name = context

        if slice_name not in already_classified:
            by_slice.setdefault(slice_name, []).append((filepath, error_code, message))

    for slice_name, errors in by_slice.items():
        error_codes = {e[1] for e in errors}
        affected = list({e[0] for e in errors})

        if error_codes & {"TS2307", "TS2305"}:
            failure_class = IMPORT_ERROR
        else:
            failure_class = TYPE_ERROR

        results.append(SliceClassification(
            slice_name=slice_name,
            failure_class=failure_class,
            details=[f"{code}: {msg}" for _, code, msg in errors[:5]],
            affected_files=affected,
        ))

    return results


# ---------------------------------------------------------------------------
# Main classifier
# ---------------------------------------------------------------------------

def classify_all(
    verify_json: list[dict] | None = None,
    test_output: str | None = None,
    compiler_output: str | None = None,
) -> list[SliceClassification]:
    """Run all classifiers and merge results. Returns one classification per failing slice."""
    results: dict[str, SliceClassification] = {}

    # Phase 1: Verify output (highest signal)
    if verify_json:
        for c in classify_verify_failures(verify_json):
            results[c.slice_name] = c

    already_classified = set(results.keys())

    # Phase 2: Compiler output
    if compiler_output:
        for c in classify_compiler_output(compiler_output, already_classified):
            results[c.slice_name] = c
        already_classified = set(results.keys())

    # Phase 3: Test output (lowest priority — verify/compiler give better signal)
    if test_output:
        for c in classify_test_output(test_output, already_classified):
            results[c.slice_name] = c

    return list(results.values())


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Classify evdb CI failures deterministically")
    parser.add_argument("--verify", help="Path to verify --json output")
    parser.add_argument("--test-output", help="Path to test runner output")
    parser.add_argument("--compiler-output", help="Path to tsc compiler output")
    parser.add_argument("--context", help="Context name (for filtering, not used in classification)")
    args = parser.parse_args()

    verify_json = None
    test_output = None
    compiler_output = None

    if args.verify:
        path = Path(args.verify)
        if path.exists():
            try:
                data = json.loads(path.read_text())
                # Handle both single-slice and --all output formats
                verify_json = data if isinstance(data, list) else [data]
            except (json.JSONDecodeError, ValueError) as e:
                print(f"Warning: Could not parse verify output: {e}", file=sys.stderr)

    if args.test_output:
        path = Path(args.test_output)
        if path.exists():
            test_output = path.read_text()

    if args.compiler_output:
        path = Path(args.compiler_output)
        if path.exists():
            compiler_output = path.read_text()

    classifications = classify_all(verify_json, test_output, compiler_output)

    output = {
        "total_failures": len(classifications),
        "classifications": [c.to_dict() for c in classifications],
        "summary": _build_summary(classifications),
    }

    print(json.dumps(output, indent=2))


def _build_summary(classifications: list[SliceClassification]) -> dict:
    """Build a summary of failure classes."""
    by_class: dict[str, int] = {}
    for c in classifications:
        by_class[c.failure_class] = by_class.get(c.failure_class, 0) + 1
    return {
        "by_class": by_class,
        "all_deterministic": all(c.deterministic for c in classifications),
        "has_env_issues": any(c.failure_class == FLAKY_OR_ENV for c in classifications),
    }


if __name__ == "__main__":
    main()
