#!/usr/bin/env python3
"""Tests for confidence_scorer.py — deterministic confidence scoring."""

import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from confidence_scorer import (
    score_slice,
    score_all_slices,
    extract_verify_signals,
    extract_classification_signals,
    extract_repair_signals,
    load_config,
    SliceScore,
)


def default_config():
    return load_config()


class TestScoreSlice(unittest.TestCase):
    """Test the scoring engine."""

    def _score(self, **overrides):
        """Helper: score with sensible defaults, overriding specific signals."""
        verify = overrides.pop("verify_signals", {
            "verify_passed": True, "verify_fail_count": 0, "verify_warn_count": 0, "has_todos": False
        })
        test_passed = overrides.pop("test_passed", True)
        classification = overrides.pop("classification_signals", {
            "has_failure": False, "failure_class": None, "deterministic_classification": True
        })
        repair = overrides.pop("repair_signals", {
            "repair_attempted": False, "repair_succeeded": False,
            "repair_ai_used": False, "repair_files_touched": 0, "repair_diff_size": 0
        })
        claude = overrides.pop("claude_signals", {
            "total_tokens": 30000, "num_turns": 10, "cost_usd": 0.5
        })
        return score_slice("TestSlice", verify, test_passed, classification, repair, claude, default_config())

    def test_perfect_score(self):
        """All green: verify pass + test pass + no todos + no repair + clean."""
        result = self._score()
        self.assertEqual(result.score, 100)
        self.assertEqual(result.band, "HIGH")
        self.assertIn("All checks passed", result.reasons)

    def test_verify_fail_reduces_score(self):
        result = self._score(verify_signals={
            "verify_passed": False, "verify_fail_count": 3, "verify_warn_count": 0, "has_todos": False
        })
        self.assertLess(result.score, 100)
        self.assertLessEqual(result.score, 65)  # lost 35 for verify

    def test_test_fail_reduces_score(self):
        result = self._score(test_passed=False)
        self.assertLess(result.score, 100)
        self.assertLessEqual(result.score, 65)

    def test_both_fail_is_blocked(self):
        result = self._score(
            verify_signals={"verify_passed": False, "verify_fail_count": 5, "verify_warn_count": 0, "has_todos": True},
            test_passed=False,
            classification_signals={"has_failure": True, "failure_class": "test_failure", "deterministic_classification": True},
        )
        self.assertLessEqual(result.score, 30)
        self.assertIn(result.band, ("LOW", "BLOCKED"))

    def test_todos_reduce_score(self):
        result = self._score(verify_signals={
            "verify_passed": True, "verify_fail_count": 0, "verify_warn_count": 1, "has_todos": True
        })
        self.assertEqual(result.score, 90)  # lost 10 for todos

    def test_repair_succeeded_gives_partial_credit(self):
        result = self._score(
            classification_signals={"has_failure": True, "failure_class": "type_error", "deterministic_classification": True},
            repair_signals={
                "repair_attempted": True, "repair_succeeded": True,
                "repair_ai_used": False, "repair_files_touched": 1, "repair_diff_size": 5
            },
        )
        # Lost 10 for needing repair, gained 5 for successful repair = net -5
        self.assertEqual(result.score, 95)

    def test_repair_failed_no_credit(self):
        result = self._score(
            classification_signals={"has_failure": True, "failure_class": "type_error", "deterministic_classification": True},
            repair_signals={
                "repair_attempted": True, "repair_succeeded": False,
                "repair_ai_used": True, "repair_files_touched": 0, "repair_diff_size": 0
            },
        )
        self.assertEqual(result.score, 90)  # lost 10 for needing repair

    def test_token_anomaly_penalty(self):
        result = self._score(claude_signals={"total_tokens": 100000, "num_turns": 10, "cost_usd": 2.0})
        self.assertEqual(result.score, 95)  # lost 5 for token anomaly

    def test_turn_anomaly_penalty(self):
        result = self._score(claude_signals={"total_tokens": 30000, "num_turns": 45, "cost_usd": 0.5})
        self.assertEqual(result.score, 95)  # lost 5 for turn anomaly

    def test_both_anomalies(self):
        result = self._score(claude_signals={"total_tokens": 100000, "num_turns": 45, "cost_usd": 3.0})
        self.assertEqual(result.score, 90)

    def test_large_repair_diff_penalized(self):
        result = self._score(
            classification_signals={"has_failure": True, "failure_class": "type_error", "deterministic_classification": True},
            repair_signals={
                "repair_attempted": True, "repair_succeeded": True,
                "repair_ai_used": True, "repair_files_touched": 5, "repair_diff_size": 50
            },
        )
        # Lost: 10 (no_repair_needed) + 5 (diff boundary not clean) = -15, gained 5 (repair succeeded)
        self.assertEqual(result.score, 90)

    def test_score_clamped_to_0(self):
        result = self._score(
            verify_signals={"verify_passed": False, "verify_fail_count": 10, "verify_warn_count": 0, "has_todos": True},
            test_passed=False,
            classification_signals={"has_failure": True, "failure_class": "unknown", "deterministic_classification": True},
            repair_signals={"repair_attempted": True, "repair_succeeded": False, "repair_ai_used": True, "repair_files_touched": 0, "repair_diff_size": 50},
            claude_signals={"total_tokens": 200000, "num_turns": 50, "cost_usd": 10.0},
        )
        self.assertGreaterEqual(result.score, 0)


class TestBands(unittest.TestCase):
    """Test band assignment."""

    def test_high_band(self):
        config = default_config()
        result = score_slice(
            "X",
            {"verify_passed": True, "verify_fail_count": 0, "verify_warn_count": 0, "has_todos": False},
            True,
            {"has_failure": False, "failure_class": None, "deterministic_classification": True},
            {"repair_attempted": False, "repair_succeeded": False, "repair_ai_used": False, "repair_files_touched": 0, "repair_diff_size": 0},
            {"total_tokens": 30000, "num_turns": 10, "cost_usd": 0.5},
            config,
        )
        self.assertEqual(result.band, "HIGH")

    def test_blocked_band(self):
        config = default_config()
        result = score_slice(
            "X",
            {"verify_passed": False, "verify_fail_count": 10, "verify_warn_count": 0, "has_todos": True},
            False,
            {"has_failure": True, "failure_class": "unknown", "deterministic_classification": True},
            {"repair_attempted": True, "repair_succeeded": False, "repair_ai_used": True, "repair_files_touched": 0, "repair_diff_size": 50},
            {"total_tokens": 200000, "num_turns": 50, "cost_usd": 10.0},
            config,
        )
        self.assertEqual(result.band, "BLOCKED")


class TestSignalExtractors(unittest.TestCase):
    """Test helper functions that extract signals from pipeline outputs."""

    def test_verify_signals_passing(self):
        data = [{"slice": "X", "passed": True, "fail_count": 0, "warn_count": 2, "checks": []}]
        sig = extract_verify_signals(data, "X")
        self.assertTrue(sig["verify_passed"])
        self.assertEqual(sig["verify_warn_count"], 2)

    def test_verify_signals_missing_slice(self):
        sig = extract_verify_signals([], "Missing")
        self.assertTrue(sig["verify_passed"])  # absent = assumed OK

    def test_classification_signals_no_failure(self):
        sig = extract_classification_signals({"classifications": []}, "X")
        self.assertFalse(sig["has_failure"])

    def test_repair_signals_not_attempted(self):
        sig = extract_repair_signals({"repairs": []}, "X")
        self.assertFalse(sig["repair_attempted"])


class TestScoreAllSlices(unittest.TestCase):
    """Test multi-slice scoring."""

    def test_multiple_slices_scored(self):
        config = default_config()
        verify = [
            {"slice": "A", "passed": True, "fail_count": 0, "warn_count": 0, "checks": []},
            {"slice": "B", "passed": False, "fail_count": 2, "warn_count": 0, "checks": []},
        ]
        results = score_all_slices(
            ["A", "B"], verify, True, {}, {}, {}, config
        )
        self.assertEqual(len(results), 2)
        scores = {r.slice_name: r.score for r in results}
        self.assertGreater(scores["A"], scores["B"])


if __name__ == "__main__":
    unittest.main()
