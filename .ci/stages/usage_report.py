#!/usr/bin/env python3
"""Aggregate slice-metrics.jsonl into a usage/cost report.

Reads historical JSONL files from downloaded GitHub Actions artifacts
and produces a structured report with success rates, cost breakdowns,
repair statistics, and spec quality scores.

Usage:
    python3 .ci/stages/usage_report.py \
        --metrics-dir /tmp/metrics-history \
        --days 30 \
        --output /tmp/usage-report.json
"""
from __future__ import annotations

import argparse
import json
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path


def _load_records(metrics_dir: str, days: int) -> list[dict]:
    """Load all JSONL records from the metrics directory within the time window."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    records: list[dict] = []

    metrics_path = Path(metrics_dir)
    if not metrics_path.exists():
        return records

    for jsonl_file in metrics_path.rglob("slice-metrics.jsonl"):
        try:
            for line in jsonl_file.read_text().splitlines():
                line = line.strip()
                if not line:
                    continue
                record = json.loads(line)
                ts = record.get("timestamp", "")
                try:
                    record_time = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    if record_time >= cutoff:
                        records.append(record)
                except (ValueError, TypeError):
                    records.append(record)  # include if timestamp unparseable
        except Exception:
            continue

    return records


def _compute_percentiles(values: list[float]) -> dict:
    """Compute P50, P95, and mean for a list of values."""
    if not values:
        return {"mean": 0, "p50": 0, "p95": 0, "min": 0, "max": 0}
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    return {
        "mean": round(statistics.mean(sorted_vals), 2),
        "p50": round(sorted_vals[n // 2], 2),
        "p95": round(sorted_vals[int(n * 0.95)], 2) if n > 1 else round(sorted_vals[0], 2),
        "min": round(sorted_vals[0], 2),
        "max": round(sorted_vals[-1], 2),
    }


def _week_key(ts_str: str) -> str:
    """Convert a timestamp to a YYYY-WNN week key."""
    try:
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        return dt.strftime("%Y-W%V")
    except Exception:
        return "unknown"


def generate_report(records: list[dict], days: int) -> dict:
    """Compute aggregate statistics from metric records."""
    if not records:
        return {
            "period": {"days": days, "total_records": 0},
            "totals": {},
            "averages": {},
            "rates": {},
            "failure_classes": [],
            "by_context": {},
            "by_week": [],
        }

    total = len(records)

    # ── Totals ──────────────────────────────────────────────────
    verify_passed = sum(1 for r in records if r.get("verify_passed"))
    test_passed = sum(1 for r in records if r.get("test_passed"))
    both_passed = sum(1 for r in records if r.get("verify_passed") and r.get("test_passed"))
    total_cost = sum(float(r.get("cost_usd", 0)) for r in records)
    repair_cost = sum(float(r.get("repair_cost_usd", 0)) for r in records)

    # Unique runs
    run_ids = {r.get("workflow_run_id") for r in records if r.get("workflow_run_id")}

    # ── Averages ────────────────────────────────────────────────
    turns = [int(r.get("num_turns", 0)) for r in records if r.get("num_turns")]
    costs = [float(r.get("cost_usd", 0)) for r in records if r.get("cost_usd")]

    # ── Rates ───────────────────────────────────────────────────
    repair_attempted = sum(1 for r in records if r.get("repair_attempted"))
    repair_resolved = sum(1 for r in records if r.get("repair_resolved"))
    clarification_needed = sum(1 for r in records if r.get("clarification_needed"))

    # ── Failure classes ─────────────────────────────────────────
    fc_counter: Counter = Counter()
    for r in records:
        fc = r.get("failure_class")
        if fc:
            fc_counter[fc] += 1

    top_failures = [
        {"class": cls, "count": count, "pct": round(count / total, 2)}
        for cls, count in fc_counter.most_common(10)
    ]

    # ── By context ──────────────────────────────────────────────
    by_context: dict[str, dict] = defaultdict(lambda: {
        "total": 0, "passed": 0, "cost_usd": 0, "repair_count": 0,
    })
    for r in records:
        ctx = r.get("context", "unknown")
        by_context[ctx]["total"] += 1
        if r.get("verify_passed") and r.get("test_passed"):
            by_context[ctx]["passed"] += 1
        by_context[ctx]["cost_usd"] += float(r.get("cost_usd", 0))
        if r.get("repair_attempted"):
            by_context[ctx]["repair_count"] += 1

    for ctx_data in by_context.values():
        ctx_data["success_rate"] = round(ctx_data["passed"] / ctx_data["total"], 2) if ctx_data["total"] else 0
        ctx_data["cost_usd"] = round(ctx_data["cost_usd"], 2)

    # ── By week ─────────────────────────────────────────────────
    weekly: dict[str, dict] = defaultdict(lambda: {"total": 0, "passed": 0, "cost_usd": 0})
    for r in records:
        wk = _week_key(r.get("timestamp", ""))
        weekly[wk]["total"] += 1
        if r.get("verify_passed") and r.get("test_passed"):
            weekly[wk]["passed"] += 1
        weekly[wk]["cost_usd"] += float(r.get("cost_usd", 0))

    by_week = []
    for wk in sorted(weekly.keys()):
        w = weekly[wk]
        by_week.append({
            "week": wk,
            "slices": w["total"],
            "passed": w["passed"],
            "success_rate": round(w["passed"] / w["total"], 2) if w["total"] else 0,
            "cost_usd": round(w["cost_usd"], 2),
        })

    # ── Confidence distribution ─────────────────────────────────
    bands: Counter = Counter()
    scores = []
    for r in records:
        band = r.get("confidence_band", "")
        if band:
            bands[band] += 1
        score = r.get("confidence_score")
        if score is not None:
            scores.append(float(score))

    # ── Spec quality score ──────────────────────────────────────
    # Higher is better: 1 - (clarification_rate * 0.6 + repair_rate * 0.4)
    clar_rate = clarification_needed / total if total else 0
    repair_rate = repair_attempted / total if total else 0
    spec_quality = round(1 - (clar_rate * 0.6 + repair_rate * 0.4), 2)

    return {
        "period": {
            "days": days,
            "total_records": total,
            "total_runs": len(run_ids),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
        "totals": {
            "slices_generated": total,
            "success_count": both_passed,
            "success_rate": round(both_passed / total, 2) if total else 0,
            "total_cost_usd": round(total_cost, 2),
            "total_repair_cost_usd": round(repair_cost, 2),
        },
        "averages": {
            "turns_per_slice": _compute_percentiles(turns),
            "cost_per_slice_usd": _compute_percentiles(costs),
            "confidence_score": _compute_percentiles(scores),
        },
        "rates": {
            "verify_pass_rate": round(verify_passed / total, 2) if total else 0,
            "test_pass_rate": round(test_passed / total, 2) if total else 0,
            "first_pass_success_rate": round(both_passed / total, 2) if total else 0,
            "repair_rate": round(repair_rate, 2),
            "repair_success_rate": round(repair_resolved / repair_attempted, 2) if repair_attempted else 0,
            "clarification_rate": round(clar_rate, 2),
        },
        "confidence_distribution": dict(bands),
        "spec_quality_score": spec_quality,
        "failure_classes": top_failures,
        "by_context": dict(by_context),
        "by_week": by_week,
    }


def main():
    parser = argparse.ArgumentParser(description="Aggregate usage report from metrics")
    parser.add_argument("--metrics-dir", required=True, help="Directory with downloaded JSONL artifacts")
    parser.add_argument("--days", type=int, default=30, help="Report window in days")
    parser.add_argument("--output", default="/tmp/usage-report.json", help="Output JSON path")
    args = parser.parse_args()

    records = _load_records(args.metrics_dir, args.days)
    print(f"  Loaded {len(records)} metric records from {args.metrics_dir}")

    report = generate_report(records, args.days)

    Path(args.output).write_text(json.dumps(report, indent=2) + "\n")
    print(f"  Report written to {args.output}")


if __name__ == "__main__":
    main()
