#!/usr/bin/env python3
"""Stage: Classify failures — deterministic failure classification.

Logic migrated from .claude/scripts/classify_failure.py (unchanged rules).
Wraps with audit logging and GITHUB_OUTPUT.

Usage:
    python3 .ci/stages/classify.py \
        --verify /tmp/verify-results.json \
        --test-output /tmp/test-output.txt \
        --context Portfolio
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.contracts import CLASSIFICATION, TEST_RESULTS, load_json, write_json, set_output
from lib.audit import emit


# ── Failure classes ──────────────────────────────────────────────

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


# ── Verify output classification ────────────────────────────────

def classify_verify_failures(verify_data: list[dict]) -> list[SliceClassification]:
    """Classify failures from verify --json --all output."""
    results = []
    for entry in verify_data:
        slice_name = entry.get("slice", "unknown")
        if entry.get("passed", True):
            continue

        checks = entry.get("checks", [])
        failed = [c for c in checks if c.get("status") in ("FAIL", "MISSING")]
        if not failed:
            continue

        results.append(_classify_checks(slice_name, failed))
    return results


def _classify_checks(slice_name: str, failed_checks: list[dict]) -> SliceClassification:
    """Classify failed checks into a single failure class. Priority-ordered."""
    missing = [c for c in failed_checks if c.get("status") == "MISSING"]
    fails = [c for c in failed_checks if c.get("status") == "FAIL"]
    affected = list({c.get("file", "") for c in failed_checks})
    details = [f"{c.get('check', '')}: {c.get('detail', '')}" for c in failed_checks]

    if missing:
        return SliceClassification(slice_name, PATH_ERROR,
                                   [f"MISSING: {c.get('file', '')}" for c in missing],
                                   [c.get("file", "") for c in missing])

    pred = [c for c in fails if "predicate" in c.get("check", "")]
    handler = [c for c in fails if "appends_" in c.get("check", "")]
    types = [c for c in fails if "field_" in c.get("check", "")]
    imports = [c for c in fails if "import" in c.get("check", "")]

    if imports and not pred and not handler:
        return SliceClassification(slice_name, IMPORT_ERROR, details, affected)
    if types and not pred and not handler:
        return SliceClassification(slice_name, TYPE_ERROR, details, affected)
    if pred:
        return SliceClassification(slice_name, PREDICATE_MISMATCH, details,
                                   [f for f in affected if "gwts" in f])
    if handler:
        return SliceClassification(slice_name, MISSING_HANDLER_BRANCH, details,
                                   [f for f in affected if "commandHandler" in f])

    return SliceClassification(slice_name, VERIFICATION_FAILURE, details, affected)


# ── Test output classification ──────────────────────────────────

FLAKY_PATTERNS = [
    re.compile(r"ETIMEOUT", re.I), re.compile(r"ECONNREFUSED", re.I),
    re.compile(r"ECONNRESET", re.I), re.compile(r"heap out of memory", re.I),
    re.compile(r"ENOMEM", re.I), re.compile(r"timed?\s*out", re.I),
    re.compile(r"SIGKILL|SIGTERM", re.I),
]

def classify_test_results(test_results: list[dict], already: set[str]) -> list[SliceClassification]:
    """Classify failures from structured test results (JSON from verify_and_test.py).

    No regex. Each result has: file, slice, passed, exit_code, error.
    Deterministic: if passed=false and slice not already classified, it's a test_failure.
    """
    results = []
    for entry in test_results:
        if entry.get("passed", True):
            continue

        slice_name = entry.get("slice", "")
        if not slice_name or slice_name in already:
            continue

        error = entry.get("error", "")

        # Check for environment/flaky issues in the error text
        is_flaky = any(p.search(error) for p in FLAKY_PATTERNS)
        if is_flaky:
            results.append(SliceClassification(slice_name, FLAKY_OR_ENV,
                                               [f"Environment: {error[:200]}"]))
        else:
            results.append(SliceClassification(
                slice_name, TEST_FAILURE,
                [f"Test failure in {entry.get('file', '?')}", error[:200]],
                affected_files=[entry.get("file", "")],
            ))

    return results


def classify_test_output_fallback(test_output: str, already: set[str]) -> list[SliceClassification]:
    """Fallback: classify from raw test output text if structured results unavailable."""
    if not test_output or not test_output.strip():
        return []

    for p in FLAKY_PATTERNS:
        if p.search(test_output):
            return [SliceClassification("__all__", FLAKY_OR_ENV,
                                        [f"Environment: {p.pattern}"])]

    if "# fail" in test_output or "not ok" in test_output:
        return [SliceClassification("__all__", TEST_FAILURE,
                                    ["Test failures — see test-output.txt for details"])]
    return []


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Classify CI failures")
    parser.add_argument("--verify", required=True)
    parser.add_argument("--test-output", default="")
    parser.add_argument("--context", default="")
    args = parser.parse_args()

    # Load inputs
    verify_data = load_json(Path(args.verify))
    if isinstance(verify_data, dict):
        verify_data = [verify_data] if verify_data else []

    # Classify
    results: dict[str, SliceClassification] = {}

    for c in classify_verify_failures(verify_data):
        results[c.slice_name] = c

    already = set(results.keys())

    # Prefer structured test results (JSON) over raw text output
    test_results_data = load_json(TEST_RESULTS)
    if test_results_data and "results" in test_results_data:
        for c in classify_test_results(test_results_data["results"], already):
            results[c.slice_name] = c
    else:
        # Fallback to raw text parsing if structured results unavailable
        test_output = ""
        if args.test_output and Path(args.test_output).exists():
            test_output = Path(args.test_output).read_text()
        if test_output:
            for c in classify_test_output_fallback(test_output, already):
                results[c.slice_name] = c

    classifications = list(results.values())

    # Audit each classification
    for c in classifications:
        emit("classify_result", "classify.py",
             slice=c.slice_name, context=args.context,
             data={"failure_class": c.failure_class, "deterministic": c.deterministic,
                    "affected_files": c.affected_files[:5]})

    # Output
    by_class: dict[str, int] = {}
    for c in classifications:
        by_class[c.failure_class] = by_class.get(c.failure_class, 0) + 1

    output = {
        "total_failures": len(classifications),
        "classifications": [c.to_dict() for c in classifications],
        "summary": {
            "by_class": by_class,
            "all_deterministic": all(c.deterministic for c in classifications),
            "has_env_issues": any(c.failure_class == FLAKY_OR_ENV for c in classifications),
        },
    }
    write_json(CLASSIFICATION, output)

    set_output("total_failures", str(len(classifications)))
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
