#!/usr/bin/env python3
"""Tests for classify_failure.py — deterministic failure classifier."""

import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from classify_failure import (
    classify_verify_failures,
    classify_test_output,
    classify_compiler_output,
    classify_all,
    TYPE_ERROR,
    IMPORT_ERROR,
    PATH_ERROR,
    PREDICATE_MISMATCH,
    MISSING_HANDLER_BRANCH,
    VERIFICATION_FAILURE,
    TEST_FAILURE,
    FLAKY_OR_ENV,
    UNKNOWN,
)


class TestVerifyClassification(unittest.TestCase):
    """Test classification from verify JSON output."""

    def test_passing_slice_not_classified(self):
        verify = [{"slice": "FundDeposit", "passed": True, "fail_count": 0, "warn_count": 0, "checks": []}]
        result = classify_verify_failures(verify)
        self.assertEqual(len(result), 0)

    def test_missing_file_classified_as_path_error(self):
        verify = [{
            "slice": "FundDeposit",
            "passed": False,
            "fail_count": 1,
            "warn_count": 0,
            "checks": [
                {"file": "slices/FundDeposit/command.ts", "check": "file_exists", "status": "MISSING", "detail": ""}
            ],
        }]
        result = classify_verify_failures(verify)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].failure_class, PATH_ERROR)
        self.assertEqual(result[0].slice_name, "FundDeposit")

    def test_field_failure_classified_as_type_error(self):
        verify = [{
            "slice": "FundDeposit",
            "passed": False,
            "fail_count": 1,
            "warn_count": 0,
            "checks": [
                {"file": "slices/FundDeposit/command.ts", "check": "field_amount",
                 "status": "FAIL", "detail": "Missing: readonly amount: bigint"}
            ],
        }]
        result = classify_verify_failures(verify)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].failure_class, TYPE_ERROR)

    def test_predicate_failure_classified_correctly(self):
        verify = [{
            "slice": "ApproveWithdrawal",
            "passed": False,
            "fail_count": 1,
            "warn_count": 0,
            "checks": [
                {"file": "slices/ApproveWithdrawal/gwts.ts", "check": "predicate_count",
                 "status": "FAIL", "detail": "No exported predicates found, expected 3"}
            ],
        }]
        result = classify_verify_failures(verify)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].failure_class, PREDICATE_MISMATCH)

    def test_missing_handler_branch(self):
        verify = [{
            "slice": "ApproveWithdrawal",
            "passed": False,
            "fail_count": 1,
            "warn_count": 0,
            "checks": [
                {"file": "slices/ApproveWithdrawal/commandHandler.ts", "check": "appends_WithdrawalApproved",
                 "status": "FAIL", "detail": "Missing: stream.appendEventWithdrawalApproved({...})"}
            ],
        }]
        result = classify_verify_failures(verify)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].failure_class, MISSING_HANDLER_BRANCH)

    def test_import_failure_classified(self):
        verify = [{
            "slice": "FundDeposit",
            "passed": False,
            "fail_count": 1,
            "warn_count": 0,
            "checks": [
                {"file": "slices/FundDeposit/adapter.ts", "check": "handler_import",
                 "status": "FAIL", "detail": "Expected import of handleFundDeposit"}
            ],
        }]
        result = classify_verify_failures(verify)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].failure_class, IMPORT_ERROR)

    def test_multiple_slices_classified_independently(self):
        verify = [
            {
                "slice": "FundDeposit",
                "passed": False,
                "fail_count": 1,
                "warn_count": 0,
                "checks": [
                    {"file": "slices/FundDeposit/command.ts", "check": "file_exists", "status": "MISSING", "detail": ""}
                ],
            },
            {
                "slice": "ApproveWithdrawal",
                "passed": False,
                "fail_count": 1,
                "warn_count": 0,
                "checks": [
                    {"file": "slices/ApproveWithdrawal/gwts.ts", "check": "predicate_count",
                     "status": "FAIL", "detail": "No predicates"}
                ],
            },
        ]
        result = classify_verify_failures(verify)
        self.assertEqual(len(result), 2)
        classes = {r.slice_name: r.failure_class for r in result}
        self.assertEqual(classes["FundDeposit"], PATH_ERROR)
        self.assertEqual(classes["ApproveWithdrawal"], PREDICATE_MISMATCH)

    def test_generic_verification_failure(self):
        verify = [{
            "slice": "FundDeposit",
            "passed": False,
            "fail_count": 1,
            "warn_count": 0,
            "checks": [
                {"file": "slices/FundDeposit/adapter.ts", "check": "adapter_function",
                 "status": "FAIL", "detail": "Expected: export function createFundDepositAdapter"}
            ],
        }]
        result = classify_verify_failures(verify)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].failure_class, VERIFICATION_FAILURE)


class TestTestOutputClassification(unittest.TestCase):
    """Test classification from test runner output."""

    def test_flaky_timeout(self):
        output = """
        Running tests...
        ETIMEOUT: connection timed out
        """
        result = classify_test_output(output, set())
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].failure_class, FLAKY_OR_ENV)

    def test_heap_oom(self):
        output = "FATAL ERROR: JavaScript heap out of memory"
        result = classify_test_output(output, set())
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].failure_class, FLAKY_OR_ENV)

    def test_slice_test_failure(self):
        output = """
        not ok 1 - src/BusinessCapabilities/Funds/slices/FundDeposit/tests/command.slice.test.ts
        """
        result = classify_test_output(output, set())
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].failure_class, TEST_FAILURE)
        self.assertEqual(result[0].slice_name, "FundDeposit")

    def test_already_classified_slices_skipped(self):
        output = """
        not ok 1 - src/BusinessCapabilities/Funds/slices/FundDeposit/tests/command.slice.test.ts
        """
        result = classify_test_output(output, {"FundDeposit"})
        self.assertEqual(len(result), 0)

    def test_import_error_in_test_output(self):
        output = """
        not ok 1 - src/BusinessCapabilities/Funds/slices/FundDeposit/tests/command.slice.test.ts
        Cannot find module '../commandHandler.js'
        """
        result = classify_test_output(output, set())
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].failure_class, IMPORT_ERROR)

    def test_empty_output_no_failures(self):
        result = classify_test_output("", set())
        self.assertEqual(len(result), 0)


class TestCompilerOutputClassification(unittest.TestCase):
    """Test classification from tsc output."""

    def test_import_error_ts2307(self):
        output = """
        src/BusinessCapabilities/Funds/slices/FundDeposit/adapter.ts(3,24): error TS2307: Cannot find module './handler.js'
        """
        result = classify_compiler_output(output, set())
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].failure_class, IMPORT_ERROR)

    def test_type_error(self):
        output = """
        src/BusinessCapabilities/Funds/slices/FundDeposit/command.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
        """
        result = classify_compiler_output(output, set())
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].failure_class, TYPE_ERROR)


class TestClassifyAll(unittest.TestCase):
    """Test the combined classifier."""

    def test_verify_takes_priority_over_test(self):
        verify = [{
            "slice": "FundDeposit",
            "passed": False,
            "fail_count": 1,
            "warn_count": 0,
            "checks": [
                {"file": "slices/FundDeposit/gwts.ts", "check": "predicate_count",
                 "status": "FAIL", "detail": "No predicates"}
            ],
        }]
        test_output = "not ok 1 - src/BusinessCapabilities/Funds/slices/FundDeposit/tests/command.slice.test.ts"

        result = classify_all(verify_json=verify, test_output=test_output)
        # Should have only 1 entry (verify wins)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].failure_class, PREDICATE_MISMATCH)

    def test_no_failures_returns_empty(self):
        verify = [{"slice": "FundDeposit", "passed": True, "fail_count": 0, "warn_count": 0, "checks": []}]
        result = classify_all(verify_json=verify, test_output="ok 1 - all tests pass")
        self.assertEqual(len(result), 0)

    def test_all_classifications_are_deterministic(self):
        verify = [{
            "slice": "X",
            "passed": False,
            "fail_count": 1,
            "warn_count": 0,
            "checks": [
                {"file": "slices/X/command.ts", "check": "file_exists", "status": "MISSING", "detail": ""}
            ],
        }]
        result = classify_all(verify_json=verify)
        for c in result:
            self.assertTrue(c.deterministic)


if __name__ == "__main__":
    unittest.main()
