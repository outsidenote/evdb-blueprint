"""Shared paths and contract definitions for CI pipeline stages.

All stages read/write to these paths. Import this module to get consistent paths.
"""
from pathlib import Path

# ── Temp file paths (shared between stages) ──────────────────────
GENERATE_OUTPUT = Path("/tmp/generate-output.json")
CLAUDE_STATS = Path("/tmp/claude-stats.json")
CLAUDE_SUMMARY = Path("/tmp/claude-summary.txt")
VERIFY_RESULTS = Path("/tmp/verify-results.json")
TEST_OUTPUT = Path("/tmp/test-output.txt")
CLASSIFICATION = Path("/tmp/classification.json")
REPAIR_RESULTS = Path("/tmp/repair-results.json")
CONFIDENCE = Path("/tmp/confidence.json")
SLICE_METRICS = Path("/tmp/slice-metrics.jsonl")

def slice_stats_path(slice_name: str) -> Path:
    return Path(f"/tmp/slice-stats-{slice_name}.json")

def slice_claude_output(slice_name: str) -> Path:
    return Path(f"/tmp/claude-{slice_name}.json")
