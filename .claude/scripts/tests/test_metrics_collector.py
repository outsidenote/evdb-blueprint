#!/usr/bin/env python3
"""Tests for metrics_collector.py — slice-level metrics persistence."""

import json
import tempfile
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from metrics_collector import build_slice_record, _parse_duration


class TestBuildSliceRecord(unittest.TestCase):
    """Test JSONL record construction."""

    def test_basic_record(self):
        record = build_slice_record(
            slice_name="FundDeposit",
            context="Funds",
            workflow_run_id="12345",
            provider="anthropic",
            duration="5m 30s",
            verify_data=[{"slice": "FundDeposit", "passed": True, "fail_count": 0, "warn_count": 1}],
            test_passed=True,
            classification_data={},
            repair_data={},
            confidence_data={"slices": [{"slice_name": "FundDeposit", "score": 90, "band": "HIGH", "recommended_action": "Ready for review"}]},
            claude_stats={"input_tokens": 50000, "output_tokens": 5000, "total_tokens": 55000, "cost": 1.23, "num_turns": 12, "api_time_s": 60},
            changed_files=["src/BusinessCapabilities/Funds/slices/FundDeposit/gwts.ts"],
            diff_lines=42,
        )
        self.assertEqual(record["slice"], "FundDeposit")
        self.assertEqual(record["context"], "Funds")
        self.assertTrue(record["verify_passed"])
        self.assertTrue(record["test_passed"])
        self.assertEqual(record["confidence_score"], 90)
        self.assertEqual(record["confidence_band"], "HIGH")
        self.assertIsNone(record["failure_class"])
        self.assertEqual(record["cost_usd"], 1.23)
        self.assertEqual(record["total_tokens"], 55000)
        self.assertEqual(record["duration_s"], 330)

    def test_record_with_failure(self):
        record = build_slice_record(
            slice_name="FundDeposit",
            context="Funds",
            workflow_run_id="12345",
            provider="bedrock",
            duration="10m 0s",
            verify_data=[{"slice": "FundDeposit", "passed": False, "fail_count": 2, "warn_count": 0}],
            test_passed=False,
            classification_data={"classifications": [
                {"slice_name": "FundDeposit", "failure_class": "predicate_mismatch", "details": ["No predicates"], "affected_files": ["gwts.ts"]}
            ]},
            repair_data={"repairs": [
                {"slice_name": "FundDeposit", "repaired": True, "strategy_used": "predicate_repair", "ai_used": True, "files_touched": ["gwts.ts"], "diff_size": 10}
            ]},
            confidence_data={"slices": [{"slice_name": "FundDeposit", "score": 45, "band": "LOW", "recommended_action": "Manual review"}]},
            claude_stats={},
            changed_files=[],
            diff_lines=0,
        )
        self.assertFalse(record["verify_passed"])
        self.assertFalse(record["test_passed"])
        self.assertEqual(record["failure_class"], "predicate_mismatch")
        self.assertTrue(record["repair_attempted"])
        self.assertTrue(record["repair_succeeded"])
        self.assertTrue(record["repair_ai_used"])
        self.assertEqual(record["confidence_score"], 45)
        self.assertEqual(record["confidence_band"], "LOW")

    def test_record_no_confidence(self):
        record = build_slice_record(
            slice_name="X",
            context="Ctx",
            workflow_run_id="1",
            provider="anthropic",
            duration="1m 0s",
            verify_data=[],
            test_passed=True,
            classification_data={},
            repair_data={},
            confidence_data={},
            claude_stats={},
            changed_files=[],
            diff_lines=0,
        )
        self.assertIsNone(record["confidence_score"])
        self.assertIsNone(record["confidence_band"])

    def test_timestamp_present(self):
        record = build_slice_record(
            slice_name="X", context="Ctx", workflow_run_id="1",
            provider="anthropic", duration="0m 0s",
            verify_data=[], test_passed=True,
            classification_data={}, repair_data={},
            confidence_data={}, claude_stats={},
            changed_files=[], diff_lines=0,
        )
        self.assertIn("timestamp", record)
        self.assertIn("T", record["timestamp"])  # ISO format


class TestParseDuration(unittest.TestCase):
    """Test duration string parsing."""

    def test_minutes_and_seconds(self):
        self.assertEqual(_parse_duration("5m 30s"), 330)

    def test_minutes_only(self):
        self.assertEqual(_parse_duration("3m"), 180)

    def test_seconds_only(self):
        self.assertEqual(_parse_duration("45s"), 45)

    def test_zero(self):
        self.assertEqual(_parse_duration("0m 0s"), 0)

    def test_empty_string(self):
        self.assertEqual(_parse_duration(""), 0)


if __name__ == "__main__":
    unittest.main()
