#!/usr/bin/env python3
"""Stage: Collect slice-level metrics into structured JSONL.

Absorbs logic from metrics_collector.py with enhanced schema
(risk scores, policy decisions, repair ladder data).

Usage:
    python3 .ci/stages/collect_metrics.py \
        --context Portfolio \
        --slices "addloantoportfolio,assessloanrisk" \
        --workflow-run-id 12345 \
        --provider anthropic \
        --duration "5m 30s" \
        --root . \
        --output /tmp/slice-metrics.jsonl
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.contracts import load_json, SLICE_METRICS


def parse_duration(s: str) -> int:
    total = 0
    m = re.search(r"(\d+)m", s)
    if m:
        total += int(m.group(1)) * 60
    sec = re.search(r"(\d+)s", s)
    if sec:
        total += int(sec.group(1))
    return total


def list_changed_files(root: Path, context: str) -> list[str]:
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD",
             f"src/BusinessCapabilities/{context}/"],
            capture_output=True, text=True, cwd=str(root),
        )
        return [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]
    except Exception:
        return []


def build_record(
    slice_name: str,
    context: str,
    run_id: str,
    provider: str,
    duration: str,
    verify_data: list[dict],
    test_passed: bool,
    class_data: dict,
    repair_data: dict,
    confidence_data: dict,
    risk_data: dict,
    decisions_data: dict,
    claude_stats: dict,
    changed_files: list[str],
) -> dict:
    verify_entry = next(
        (e for e in verify_data if e.get("slice") == slice_name),
        {"passed": True, "fail_count": 0, "warn_count": 0},
    )
    classification = next(
        (c for c in class_data.get("classifications", []) if c.get("slice_name") == slice_name),
        None,
    )
    repair = next(
        (r for r in repair_data.get("repairs", []) if r.get("slice") == slice_name),
        None,
    )
    confidence = next(
        (s for s in confidence_data.get("slices", []) if s.get("slice") == slice_name),
        None,
    )
    risk = next(
        (s for s in risk_data.get("scores", []) if s.get("slice") == slice_name),
        None,
    )
    decision = next(
        (d for d in decisions_data.get("decisions", []) if d.get("slice") == slice_name),
        None,
    )

    slice_files = [f for f in changed_files if slice_name in f.lower()]

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "workflow_run_id": run_id,
        "context": context,
        "slice": slice_name,
        "provider": provider,
        "duration": duration,
        "duration_s": parse_duration(duration),
        # AI stats
        "model": decision.get("model", "unknown") if decision else "unknown",
        "model_id": decision.get("model_id", "") if decision else "",
        "input_tokens": int(claude_stats.get("input_tokens", 0)),
        "output_tokens": int(claude_stats.get("output_tokens", 0)),
        "total_tokens": int(claude_stats.get("total_tokens", 0)),
        "cost_usd": float(claude_stats.get("cost", 0)),
        "num_turns": int(claude_stats.get("turns", claude_stats.get("num_turns", 0))),
        # Verify + test
        "verify_passed": verify_entry.get("passed", True),
        "verify_fail_count": verify_entry.get("fail_count", 0),
        "test_passed": test_passed,
        # Classification
        "failure_class": classification["failure_class"] if classification else None,
        # Repair
        "repair_attempted": repair is not None,
        "repair_resolved": repair.get("resolved") if repair else None,
        "repair_level": repair.get("resolved_at_level", 0) if repair else 0,
        "repair_cost_usd": repair.get("total_cost_usd", 0) if repair else 0,
        # Risk + policy
        "risk_score": risk.get("score") if risk else None,
        "risk_band": risk.get("band") if risk else None,
        "policy_action": decision.get("action") if decision else None,
        "policy_rule": decision.get("rule_matched") if decision else None,
        # Confidence
        "confidence_score": confidence.get("score") if confidence else None,
        "confidence_band": confidence.get("band") if confidence else None,
        # Files
        "files_changed": slice_files,
        "files_changed_count": len(slice_files),
    }


def main():
    parser = argparse.ArgumentParser(description="Collect slice-level metrics")
    parser.add_argument("--context", required=True)
    parser.add_argument("--slices", required=True)
    parser.add_argument("--workflow-run-id", default="local")
    parser.add_argument("--provider", default="anthropic")
    parser.add_argument("--duration", default="0m 0s")
    parser.add_argument("--root", default=".")
    parser.add_argument("--verify", default="")
    parser.add_argument("--test-passed", default="true")
    parser.add_argument("--classification", default="")
    parser.add_argument("--repair", default="")
    parser.add_argument("--confidence", default="")
    parser.add_argument("--risk-scores", default="")
    parser.add_argument("--decisions", default="")
    parser.add_argument("--claude-stats", default="")
    parser.add_argument("--output", default=str(SLICE_METRICS))
    args = parser.parse_args()

    root = Path(args.root).resolve()
    slices = [s.strip() for s in args.slices.split(",") if s.strip()]
    test_passed = args.test_passed.lower() in ("true", "1", "yes")

    verify_raw = load_json(Path(args.verify)) if args.verify else []
    verify_data = verify_raw if isinstance(verify_raw, list) else [verify_raw] if verify_raw else []
    class_data = load_json(Path(args.classification)) if args.classification else {}
    repair_data = load_json(Path(args.repair)) if args.repair else {}
    confidence_data = load_json(Path(args.confidence)) if args.confidence else {}
    risk_data = load_json(Path(args.risk_scores)) if args.risk_scores else {}
    decisions_data = load_json(Path(args.decisions)) if args.decisions else {}
    claude_stats = load_json(Path(args.claude_stats)) if args.claude_stats else {}

    changed_files = list_changed_files(root, args.context)

    records = []
    for name in slices:
        records.append(build_record(
            name, args.context, args.workflow_run_id, args.provider, args.duration,
            verify_data, test_passed, class_data, repair_data,
            confidence_data, risk_data, decisions_data, claude_stats, changed_files,
        ))

    output_path = Path(args.output)
    with open(output_path, "w") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")

    print(json.dumps({"total_slices": len(records), "output_file": str(output_path)}, indent=2))


if __name__ == "__main__":
    main()
