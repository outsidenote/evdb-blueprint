#!/usr/bin/env python3
"""
metrics_collector.py — Slice-level metrics persistence for evdb CI pipeline.

Collects all pipeline outputs into structured JSONL for artifact upload.
Each line is one slice record. Designed for easy ingestion into dashboards,
spreadsheets, or future external sinks.

Exit codes:
  0 — metrics collected
  1 — internal error

Usage:
  python3 metrics_collector.py \
    --context Funds \
    --slices "funddeposit,approvewithdrawal" \
    --workflow-run-id 12345 \
    --provider anthropic \
    [--verify /tmp/verify-results.json] \
    [--test-passed true] \
    [--classification /tmp/classification.json] \
    [--repair /tmp/repair-results.json] \
    [--confidence /tmp/confidence.json] \
    [--claude-stats /tmp/claude-stats.txt] \
    [--duration "5m 30s"] \
    [--output /tmp/slice-metrics.jsonl]
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def parse_stats_file(path: Path) -> dict:
    """Parse key=value stats file."""
    stats = {}
    if not path.exists():
        return stats
    for line in path.read_text().strip().split("\n"):
        if "=" in line:
            key, val = line.split("=", 1)
            try:
                stats[key.strip()] = float(val.strip())
            except ValueError:
                stats[key.strip()] = val.strip()
    return stats


def count_diff_lines(root: Path, context: str) -> int:
    """Count total lines changed in the context's BusinessCapabilities dir."""
    try:
        result = subprocess.run(
            ["git", "diff", "--stat", "--cached",
             f"src/BusinessCapabilities/{context}/"],
            capture_output=True, text=True, cwd=str(root)
        )
        # Last line of --stat is like " 5 files changed, 120 insertions(+), 30 deletions(-)"
        lines = result.stdout.strip().split("\n")
        if lines:
            last = lines[-1]
            nums = [int(x) for x in last.split() if x.isdigit()]
            return sum(nums[1:]) if len(nums) > 1 else 0
    except Exception:
        pass
    return 0


def list_changed_files(root: Path, context: str) -> list[str]:
    """List files changed in this context."""
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD",
             f"src/BusinessCapabilities/{context}/"],
            capture_output=True, text=True, cwd=str(root)
        )
        return [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]
    except Exception:
        return []


def build_slice_record(
    slice_name: str,
    context: str,
    workflow_run_id: str,
    provider: str,
    duration: str,
    verify_data: list[dict],
    test_passed: bool,
    classification_data: dict,
    repair_data: dict,
    confidence_data: dict,
    claude_stats: dict,
    changed_files: list[str],
    diff_lines: int,
) -> dict:
    """Build a single JSONL record for one slice."""
    # Verify signals
    verify_entry = next(
        (e for e in verify_data if e.get("slice") == slice_name),
        {"passed": True, "fail_count": 0, "warn_count": 0}
    )

    # Classification
    classification = next(
        (c for c in classification_data.get("classifications", [])
         if c.get("slice_name") == slice_name),
        None
    )

    # Repair
    repair = next(
        (r for r in repair_data.get("repairs", [])
         if r.get("slice_name") == slice_name),
        None
    )

    # Confidence
    confidence = next(
        (s for s in confidence_data.get("slices", [])
         if s.get("slice_name") == slice_name),
        None
    )

    # Filter changed files to this slice
    slice_files = [f for f in changed_files if slice_name in f.lower()]

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "workflow_run_id": workflow_run_id,
        "context": context,
        "slice": slice_name,
        "provider": provider,
        "model": str(claude_stats.get("model", "unknown")),
        "duration": duration,
        "duration_s": _parse_duration(duration),
        "input_tokens": int(claude_stats.get("input_tokens", 0)),
        "output_tokens": int(claude_stats.get("output_tokens", 0)),
        "total_tokens": int(claude_stats.get("total_tokens", 0)),
        "cost_usd": float(claude_stats.get("cost", 0)),
        "num_turns": int(claude_stats.get("num_turns", 0)),
        "api_time_s": int(claude_stats.get("api_time_s", 0)),
        "verify_passed": verify_entry.get("passed", True),
        "verify_fail_count": verify_entry.get("fail_count", 0),
        "verify_warn_count": verify_entry.get("warn_count", 0),
        "test_passed": test_passed,
        "failure_class": classification["failure_class"] if classification else None,
        "failure_details": classification["details"][:3] if classification else [],
        "repair_attempted": repair is not None,
        "repair_succeeded": repair["repaired"] if repair else None,
        "repair_strategy": repair["strategy_used"] if repair else None,
        "repair_ai_used": repair["ai_used"] if repair else False,
        "confidence_score": confidence["score"] if confidence else None,
        "confidence_band": confidence["band"] if confidence else None,
        "recommended_action": confidence["recommended_action"] if confidence else None,
        "files_changed": slice_files,
        "files_changed_count": len(slice_files),
        "diff_lines": diff_lines,
    }


def _parse_duration(duration_str: str) -> int:
    """Parse '5m 30s' to seconds."""
    import re
    total = 0
    m = re.search(r"(\d+)m", duration_str)
    if m:
        total += int(m.group(1)) * 60
    s = re.search(r"(\d+)s", duration_str)
    if s:
        total += int(s.group(1))
    return total


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Collect slice-level metrics for evdb CI")
    parser.add_argument("--context", required=True, help="Context name")
    parser.add_argument("--slices", required=True, help="Comma-separated slice names")
    parser.add_argument("--workflow-run-id", default="local", help="GitHub workflow run ID")
    parser.add_argument("--provider", default="anthropic", help="AI provider")
    parser.add_argument("--duration", default="0m 0s", help="Total duration string")
    parser.add_argument("--root", default=".", help="Project root")
    parser.add_argument("--verify", help="Path to verify JSON")
    parser.add_argument("--test-passed", default="true", help="Whether tests passed")
    parser.add_argument("--classification", help="Path to classification JSON")
    parser.add_argument("--repair", help="Path to repair JSON")
    parser.add_argument("--confidence", help="Path to confidence JSON")
    parser.add_argument("--claude-stats", help="Path to Claude stats file")
    parser.add_argument("--output", default="/tmp/slice-metrics.jsonl", help="Output JSONL path")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    slice_names = [s.strip() for s in args.slices.split(",") if s.strip()]

    # Load all inputs
    def load_json(path_str):
        if not path_str:
            return {}
        p = Path(path_str)
        if p.exists():
            try:
                data = json.loads(p.read_text())
                return data if isinstance(data, dict) else data
            except (json.JSONDecodeError, ValueError):
                pass
        return {}

    verify_raw = load_json(args.verify)
    verify_data = verify_raw if isinstance(verify_raw, list) else [verify_raw] if verify_raw else []
    classification_data = load_json(args.classification) if args.classification else {}
    repair_data = load_json(args.repair) if args.repair else {}
    confidence_data = load_json(args.confidence) if args.confidence else {}
    claude_stats = parse_stats_file(Path(args.claude_stats)) if args.claude_stats else {}

    test_passed = args.test_passed.lower() in ("true", "1", "yes")
    changed_files = list_changed_files(root, args.context)
    diff_lines = count_diff_lines(root, args.context)

    # Build records
    records = []
    for name in slice_names:
        record = build_slice_record(
            slice_name=name,
            context=args.context,
            workflow_run_id=args.workflow_run_id,
            provider=args.provider,
            duration=args.duration,
            verify_data=verify_data,
            test_passed=test_passed,
            classification_data=classification_data,
            repair_data=repair_data,
            confidence_data=confidence_data,
            claude_stats=claude_stats,
            changed_files=changed_files,
            diff_lines=diff_lines,
        )
        records.append(record)

    # Write JSONL
    output_path = Path(args.output)
    with open(output_path, "w") as f:
        for record in records:
            f.write(json.dumps(record) + "\n")

    # Also print summary to stdout
    summary = {
        "total_slices": len(records),
        "output_file": str(output_path),
        "records": records,
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
