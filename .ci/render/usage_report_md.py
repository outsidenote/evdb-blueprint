#!/usr/bin/env python3
"""Render usage report JSON as markdown.

Usage:
    python3 .ci/render/usage_report_md.py \
        --report /tmp/usage-report.json \
        --output /tmp/usage-report.md
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def _trend_arrow(values: list[float]) -> str:
    """Return a trend arrow comparing the last two values."""
    if len(values) < 2:
        return ""
    diff = values[-1] - values[-2]
    if diff > 0.05:
        return " \u2191"
    if diff < -0.05:
        return " \u2193"
    return " \u2192"


def render(report: dict) -> str:
    period = report.get("period", {})
    totals = report.get("totals", {})
    averages = report.get("averages", {})
    rates = report.get("rates", {})
    failures = report.get("failure_classes", [])
    by_context = report.get("by_context", {})
    by_week = report.get("by_week", [])
    conf_dist = report.get("confidence_distribution", {})
    spec_quality = report.get("spec_quality_score", 0)

    lines: list[str] = []

    # ── Header ──────────────────────────────────────────────────
    lines.append(f"# Pipeline Usage Report")
    lines.append("")
    lines.append(f"**Period:** {period.get('days', '?')} days "
                 f"| **Runs:** {period.get('total_runs', '?')} "
                 f"| **Generated:** {period.get('generated_at', '?')[:10]}")
    lines.append("")

    # ── Summary table ───────────────────────────────────────────
    lines.append("## Summary")
    lines.append("")
    lines.append("| Metric | Value |")
    lines.append("|--------|------:|")
    lines.append(f"| Slices generated | **{totals.get('slices_generated', 0)}** |")
    lines.append(f"| Success rate | **{rates.get('first_pass_success_rate', 0):.0%}** |")
    lines.append(f"| Total cost | **${totals.get('total_cost_usd', 0):.2f}** |")
    lines.append(f"| Repair cost | **${totals.get('total_repair_cost_usd', 0):.2f}** |")
    lines.append(f"| Spec quality score | **{spec_quality:.0%}** |")
    lines.append("")

    # ── Rates ───────────────────────────────────────────────────
    lines.append("## Pass Rates")
    lines.append("")
    lines.append("| Rate | Value |")
    lines.append("|------|------:|")
    lines.append(f"| Verify pass | {rates.get('verify_pass_rate', 0):.0%} |")
    lines.append(f"| Test pass | {rates.get('test_pass_rate', 0):.0%} |")
    lines.append(f"| First-pass success | {rates.get('first_pass_success_rate', 0):.0%} |")
    lines.append(f"| Repair rate | {rates.get('repair_rate', 0):.0%} |")
    lines.append(f"| Repair success | {rates.get('repair_success_rate', 0):.0%} |")
    lines.append(f"| Clarification rate | {rates.get('clarification_rate', 0):.0%} |")
    lines.append("")

    # ── Cost & turns distribution ───────────────────────────────
    lines.append("## Cost & Turns Distribution")
    lines.append("")
    turns = averages.get("turns_per_slice", {})
    cost = averages.get("cost_per_slice_usd", {})
    conf = averages.get("confidence_score", {})

    lines.append("| Metric | Mean | P50 | P95 | Min | Max |")
    lines.append("|--------|-----:|----:|----:|----:|----:|")
    lines.append(f"| Turns/slice | {turns.get('mean', 0)} | {turns.get('p50', 0)} "
                 f"| {turns.get('p95', 0)} | {turns.get('min', 0)} | {turns.get('max', 0)} |")
    lines.append(f"| Cost/slice ($) | {cost.get('mean', 0)} | {cost.get('p50', 0)} "
                 f"| {cost.get('p95', 0)} | {cost.get('min', 0)} | {cost.get('max', 0)} |")
    lines.append(f"| Confidence | {conf.get('mean', 0)} | {conf.get('p50', 0)} "
                 f"| {conf.get('p95', 0)} | {conf.get('min', 0)} | {conf.get('max', 0)} |")
    lines.append("")

    # ── Confidence distribution ─────────────────────────────────
    if conf_dist:
        lines.append("## Confidence Distribution")
        lines.append("")
        lines.append("| Band | Count |")
        lines.append("|------|------:|")
        for band in ["HIGH", "MEDIUM", "LOW", "BLOCKED"]:
            count = conf_dist.get(band, 0)
            if count:
                lines.append(f"| {band} | {count} |")
        lines.append("")

    # ── Top failure classes ─────────────────────────────────────
    if failures:
        lines.append("## Top Failure Classes")
        lines.append("")
        lines.append("| Class | Count | % |")
        lines.append("|-------|------:|--:|")
        for f in failures[:10]:
            lines.append(f"| `{f['class']}` | {f['count']} | {f['pct']:.0%} |")
        lines.append("")

    # ── By context ──────────────────────────────────────────────
    if by_context:
        lines.append("## By Context")
        lines.append("")
        lines.append("| Context | Slices | Success | Cost | Repairs |")
        lines.append("|---------|-------:|--------:|-----:|--------:|")
        for ctx, data in sorted(by_context.items()):
            lines.append(f"| **{ctx}** | {data['total']} | {data.get('success_rate', 0):.0%} "
                         f"| ${data.get('cost_usd', 0):.2f} | {data.get('repair_count', 0)} |")
        lines.append("")

    # ── Weekly trend ────────────────────────────────────────────
    if by_week:
        lines.append("## Weekly Trend")
        lines.append("")
        lines.append("| Week | Slices | Passed | Success | Cost |")
        lines.append("|------|-------:|-------:|--------:|-----:|")

        success_rates = [w.get("success_rate", 0) for w in by_week]
        for i, w in enumerate(by_week):
            trend = ""
            if i > 0:
                diff = w["success_rate"] - by_week[i - 1]["success_rate"]
                trend = " \u2191" if diff > 0.05 else (" \u2193" if diff < -0.05 else "")
            lines.append(f"| {w['week']} | {w['slices']} | {w['passed']} "
                         f"| {w['success_rate']:.0%}{trend} | ${w['cost_usd']:.2f} |")
        lines.append("")

    # ── Footer ──────────────────────────────────────────────────
    lines.append("---")
    lines.append("*Generated by evdb CI pipeline v3 usage reporter*")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Render usage report as markdown")
    parser.add_argument("--report", required=True, help="Path to usage-report.json")
    parser.add_argument("--output", default="/tmp/usage-report.md", help="Output markdown path")
    args = parser.parse_args()

    report = json.load(open(args.report))
    md = render(report)

    Path(args.output).write_text(md + "\n")
    print(f"  Report rendered to {args.output}")


if __name__ == "__main__":
    main()
