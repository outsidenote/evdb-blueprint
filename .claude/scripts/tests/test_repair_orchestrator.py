#!/usr/bin/env python3
"""Tests for repair_orchestrator.py — bounded self-healing."""

import json
import os
import tempfile
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from repair_orchestrator import (
    repair_import_error,
    repair_type_error,
    repair_path_error,
    repair_slice,
    repair_all,
    load_config,
    RepairResult,
)


class TestImportRepair(unittest.TestCase):
    """Test deterministic import path fixes."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.root = Path(self.tmpdir)
        self.slice_dir = self.root / "src" / "BusinessCapabilities" / "Funds" / "slices" / "FundDeposit"
        self.slice_dir.mkdir(parents=True)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir)

    def test_fixes_ts_to_js_extension(self):
        (self.slice_dir / "adapter.ts").write_text("import { handle } from './commandHandler.ts';\n")
        result = repair_import_error(
            "FundDeposit",
            {"details": [], "affected_files": ["slices/FundDeposit/adapter.ts"]},
            self.root,
            "Funds",
        )
        self.assertTrue(result.repaired)
        content = (self.slice_dir / "adapter.ts").read_text()
        self.assertIn("./commandHandler.js", content)
        self.assertNotIn(".ts'", content)

    def test_no_changes_if_already_correct(self):
        (self.slice_dir / "adapter.ts").write_text("import { handle } from './commandHandler.js';\n")
        result = repair_import_error("FundDeposit", {"details": [], "affected_files": []}, self.root, "Funds")
        self.assertFalse(result.repaired)

    def test_missing_slice_dir(self):
        result = repair_import_error("NonExistent", {"details": [], "affected_files": []}, self.root, "Funds")
        self.assertFalse(result.repaired)


class TestTypeRepair(unittest.TestCase):
    """Test deterministic type fixes from verify detail."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.root = Path(self.tmpdir)
        bc = self.root / "src" / "BusinessCapabilities" / "Funds"
        self.cmd_file = bc / "slices" / "FundDeposit" / "command.ts"
        self.cmd_file.parent.mkdir(parents=True)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir)

    def test_fixes_field_type(self):
        self.cmd_file.write_text(
            "export interface FundDeposit extends ICommand {\n"
            "  readonly amount: string;\n"
            "}\n"
        )
        result = repair_type_error(
            "FundDeposit",
            {
                "details": ["field_amount — type may differ — expected: bigint"],
                "affected_files": ["slices/FundDeposit/command.ts"],
            },
            self.root,
            "Funds",
        )
        self.assertTrue(result.repaired)
        content = self.cmd_file.read_text()
        self.assertIn("readonly amount: bigint", content)

    def test_fixes_missing_field_detail_format(self):
        self.cmd_file.write_text(
            "export interface FundDeposit extends ICommand {\n"
            "  readonly total: number;\n"
            "}\n"
        )
        result = repair_type_error(
            "FundDeposit",
            {
                "details": ["Missing: readonly total: bigint"],
                "affected_files": ["slices/FundDeposit/command.ts"],
            },
            self.root,
            "Funds",
        )
        self.assertTrue(result.repaired)
        content = self.cmd_file.read_text()
        self.assertIn("readonly total: bigint", content)

    def test_no_fix_when_file_missing(self):
        result = repair_type_error(
            "FundDeposit",
            {"details": ["field_x — expected: number"], "affected_files": ["slices/FundDeposit/missing.ts"]},
            self.root,
            "Funds",
        )
        self.assertFalse(result.repaired)


class TestPathRepair(unittest.TestCase):
    """Test deterministic file path fixes."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.root = Path(self.tmpdir)
        self.bc = self.root / "src" / "BusinessCapabilities" / "Funds"
        self.bc.mkdir(parents=True)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir)

    def test_moves_misplaced_file(self):
        # File exists in wrong location
        wrong_dir = self.bc / "slices" / "wrong"
        wrong_dir.mkdir(parents=True)
        (wrong_dir / "command.ts").write_text("export interface X {}")

        result = repair_path_error(
            "FundDeposit",
            {"details": ["MISSING: slices/FundDeposit/command.ts"], "affected_files": []},
            self.root,
            "Funds",
        )
        self.assertTrue(result.repaired)
        expected = self.bc / "slices" / "FundDeposit" / "command.ts"
        self.assertTrue(expected.exists())

    def test_no_move_when_ambiguous(self):
        # Two candidates — don't move
        d1 = self.bc / "slices" / "a"
        d1.mkdir(parents=True)
        (d1 / "command.ts").write_text("a")

        d2 = self.bc / "slices" / "b"
        d2.mkdir(parents=True)
        (d2 / "command.ts").write_text("b")

        result = repair_path_error(
            "FundDeposit",
            {"details": ["MISSING: slices/FundDeposit/command.ts"], "affected_files": []},
            self.root,
            "Funds",
        )
        self.assertFalse(result.repaired)


class TestRepairSliceDispatch(unittest.TestCase):
    """Test strategy dispatch."""

    def test_flaky_not_repaired(self):
        config = load_config()
        result = repair_slice(
            {"slice_name": "X", "failure_class": "flaky_or_env", "details": [], "affected_files": []},
            Path("/tmp"),
            "Funds",
            config,
        )
        self.assertFalse(result.repaired)
        self.assertEqual(result.strategy_used, "none")

    def test_unknown_not_repaired(self):
        config = load_config()
        result = repair_slice(
            {"slice_name": "X", "failure_class": "unknown", "details": [], "affected_files": []},
            Path("/tmp"),
            "Funds",
            config,
        )
        self.assertFalse(result.repaired)


class TestRepairAll(unittest.TestCase):
    """Test multi-slice repair orchestration."""

    def test_env_issues_skipped(self):
        config = load_config()
        result = repair_all(
            [{"slice_name": "__all__", "failure_class": "flaky_or_env", "details": [], "affected_files": []}],
            Path("/tmp"),
            "Funds",
            config,
        )
        self.assertEqual(len(result), 1)
        self.assertFalse(result[0].repaired)

    def test_respects_max_passes(self):
        config = load_config()
        config["repair"]["max_repair_passes"] = 1
        result = repair_all(
            [{"slice_name": "X", "failure_class": "unknown", "details": [], "affected_files": []}],
            Path("/tmp"),
            "Funds",
            config,
        )
        # Should only attempt once
        self.assertEqual(len(result), 1)


if __name__ == "__main__":
    unittest.main()
