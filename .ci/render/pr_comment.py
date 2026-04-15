#!/usr/bin/env python3
"""Render PR stats comment with risk, policy, and model traceability.

Usage:
    python3 .ci/render/pr_comment.py \
        --context Portfolio --slices "addloantoportfolio" \
        --duration "5m 30s" --run-id 12345 --run-number 42 \
        --repo "owner/repo" --worst-band HIGH --avg-score 85 --repaired 0
"""
from __future__ import annotations

import argparse
import json


def load_json(path: str) -> dict | None:
    try:
        return json.load(open(path))
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--context", required=True)
    parser.add_argument("--slices", required=True)
    parser.add_argument("--duration", default="")
    parser.add_argument("--run-id", default="")
    parser.add_argument("--run-number", default="")
    parser.add_argument("--repo", default="")
    parser.add_argument("--worst-band", default="")
    parser.add_argument("--avg-score", default="")
    parser.add_argument("--repaired", default="0")
    args = parser.parse_args()

    stats = load_json("/tmp/claude-stats.json") or {}
    classification = load_json("/tmp/classification.json")
    decisions = load_json("/tmp/decisions.json")
    risk = load_json("/tmp/risk-scores.json")
    repair = load_json("/tmp/repair-results.json")

    run_link = (f"[#{args.run_number}](https://github.com/{args.repo}/actions/runs/{args.run_id})"
                if args.run_id else "")

    # Model traceability: which model was used per slice
    model_section = ""
    if decisions:
        lines = ["### Model Traceability", "", "| Slice | Model | Budget | Risk | Policy Rule |",
                 "|-------|-------|--------|:----:|-------------|"]
        for d in decisions.get("decisions", []):
            lines.append(f'| `{d["slice"]}` | {d["model"]} | ${d["max_budget_usd"]:.2f} | '
                         f'{d["risk_score"]:.2f} | {d["rule_matched"]} |')
        model_section = "\n".join(lines)

    # Classification section
    class_section = ""
    if classification and classification.get("total_failures", 0) > 0:
        lines = ["### Failure Classification", "", "| Slice | Class | Deterministic |",
                 "|-------|-------|:-------------:|"]
        for c in classification["classifications"]:
            det = "\u2713" if c.get("deterministic") else "\u2717"
            lines.append(f'| `{c["slice_name"]}` | `{c["failure_class"]}` | {det} |')
        class_section = "\n".join(lines)

    # Repair section
    repair_section = ""
    if repair and repair.get("summary", {}).get("total_slices", 0) > 0:
        s = repair["summary"]
        repair_section = (f"### Self-Healing\n\n"
                          f"**{s['resolved']}/{s['total_slices']}** resolved, "
                          f"max level L{s['max_level_used']}, "
                          f"cost ${s['total_cost_usd']:.2f}")

    # Cost breakdown by stage
    implement_cost = float(stats.get('cost', 0))
    implement_turns = int(stats.get('turns', stats.get('num_turns', 0)))
    repair_cost = float(repair.get("summary", {}).get("total_cost_usd", 0)) if repair else 0
    repair_turns = sum(
        a.get("turns", 0)
        for r in (repair.get("repairs", []) if repair else [])
        for a in r.get("attempts", [])
    )
    total_cost = implement_cost + repair_cost
    total_turns = implement_turns + repair_turns

    cost_breakdown = f"""### Cost Breakdown

| Stage | Turns | Cost |
|-------|:-----:|-----:|
| Implement (code generation) | {implement_turns} | ${implement_cost:.2f} |
| Repair (self-healing) | {repair_turns} | ${repair_cost:.2f} |
| **Total** | **{total_turns}** | **${total_cost:.2f}** |"""

    comment = f"""## Generation Stats

| Metric | Value |
|--------|-------|
| Context | **{args.context}** |
| Slices | `{args.slices}` |
| Duration | **{args.duration}** |
| Confidence | **{args.worst_band}** (avg {args.avg_score}) |
| Repairs | {args.repaired} |
| Run | {run_link} |

{cost_breakdown}

{model_section}

{class_section}

{repair_section}

---
*evdb CI v3 (risk-aware, self-healing, explainable)*"""

    print(comment)


if __name__ == "__main__":
    main()
