#!/usr/bin/env python3
"""Render PR body with review intelligence.

Outputs markdown to stdout. Includes:
  - Summary (slices, target, generation method)
  - Confidence table with evidence
  - Review guide (focus areas, risk hotspots, suggested checklist)
  - Self-healing report (if repairs applied)

Usage:
    python3 .ci/render/pr_body.py \
        --context Portfolio \
        --slices "addloantoportfolio,assessloanrisk" \
        --base-branch main
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

BAND_EMOJI = {"HIGH": "\U0001f7e2", "MEDIUM": "\U0001f7e1", "LOW": "\U0001f7e0", "BLOCKED": "\U0001f534"}
PRIORITY_ICON = {"high": "\U0001f534", "medium": "\U0001f7e1", "low": "\U0001f7e2"}


def load_json(path: str) -> dict | list | None:
    try:
        return json.load(open(path))
    except Exception:
        return None


# ── Sections ─────────────────────────────────────────────────────

def summary_section(context: str, slices: str, base: str) -> str:
    return f"""## Summary

Auto-generated slice implementations for **{context}**.

| | |
|---|---|
| **Slices** | `{slices}` |
| **Target** | `{base}` |
| **Pipeline** | v3 — risk-aware, self-healing, explainable |

### Commits
1. **Scaffold** — TypeScript boilerplate (deterministic, no AI)
2. **Business logic** — predicates, handlers, enrichment (AI-generated)
3. **Verified** — contracts + tests pass"""


def confidence_section(conf: dict | None) -> str:
    if not conf:
        return ""
    ctx = conf.get("context_summary", {})
    slices = conf.get("slices", [])
    band = ctx.get("worst_band", "UNKNOWN")
    lines = [
        f'## Confidence: {BAND_EMOJI.get(band, "")} {band} (avg {ctx.get("average_score", "?")})',
        "",
        "| Slice | Score | Band | Action |",
        "|-------|:-----:|:----:|--------|",
    ]
    for s in slices:
        e = BAND_EMOJI.get(s.get("band", ""), "")
        lines.append(f'| `{s["slice"]}` | **{s["score"]}** | {e} {s["band"]} | {s["recommended_action"]} |')

    # Evidence details (collapsible)
    slices_with_evidence = [s for s in slices if s.get("evidence")]
    if slices_with_evidence:
        lines.append("")
        lines.append("<details><summary>Score breakdown</summary>")
        lines.append("")
        for s in slices_with_evidence:
            lines.append(f'**{s["slice"]}** — {s["score"]}/100')
            lines.append("")
            lines.append("| Signal | Weight | Awarded | Detail |")
            lines.append("|--------|:------:|:-------:|--------|")
            for ev in s.get("evidence", []):
                check = "\u2705" if ev["awarded"] else "\u274c"
                lines.append(f'| {ev["signal"]} | {ev["weight"]} | {check} {ev["contributed"]} | {ev["detail"]} |')
            lines.append("")
        lines.append("</details>")

    return "\n".join(lines)


def review_guide_section(conf: dict | None, repair: dict | None, risk: dict | None) -> str:
    """Generate review intelligence — tells the human WHERE to focus."""
    if not conf:
        return ""
    slices = conf.get("slices", [])

    # Build focus areas from evidence and repair data
    focus_areas = []
    for s in slices:
        slice_name = s.get("slice", "")
        evidence = s.get("evidence", [])
        reasons = s.get("reasons", [])

        # Check if repair touched this slice
        repair_info = None
        if repair:
            for r in repair.get("repairs", []):
                if r.get("slice") == slice_name:
                    repair_info = r
                    break

        if repair_info and repair_info.get("resolved"):
            lvl = repair_info.get("resolved_at_level", 0)
            for attempt in repair_info.get("attempts", []):
                for f in attempt.get("files_touched", []):
                    focus_areas.append({
                        "priority": "high",
                        "file": f"`{f}`",
                        "reason": f"AI-repaired at L{lvl} — {attempt.get('detail', '')}",
                    })
        elif reasons != ["All checks passed"]:
            for r in reasons:
                focus_areas.append({
                    "priority": "medium",
                    "file": f"`{slice_name}`",
                    "reason": r,
                })

    # Risk hotspots
    risk_notes = []
    if risk:
        for score in risk.get("scores", []):
            if score.get("score", 0) >= 0.5:
                top_factor = max(score.get("factors", [{}]), key=lambda f: f.get("contributed", 0), default={})
                risk_notes.append(
                    f"**{score['slice']}** — risk {score['score']:.2f} "
                    f"(top factor: {top_factor.get('name', 'unknown')})")

    lines = ["## Review Guide", ""]

    if focus_areas:
        lines.append("### Focus Areas")
        lines.append("| Priority | File | Reason |")
        lines.append("|:--------:|------|--------|")
        for fa in focus_areas:
            icon = PRIORITY_ICON.get(fa["priority"], "")
            lines.append(f'| {icon} | {fa["file"]} | {fa["reason"]} |')
        lines.append("")

    if risk_notes:
        lines.append("### Risk Hotspots")
        for note in risk_notes:
            lines.append(f"- {note}")
        lines.append("")

    # Static checklist — always included
    lines.append("### Suggested Checklist")
    lines.append("- [ ] Predicate logic in `gwts.ts` matches domain rules")
    lines.append("- [ ] Command handler covers all spec scenarios")
    lines.append("- [ ] Projection SQL handles null/edge cases")
    lines.append("- [ ] Tests cover edge cases, not just happy path")
    if focus_areas:
        lines.append("- [ ] Review all AI-repaired files above")

    return "\n".join(lines)


def healing_section(repair: dict | None) -> str:
    if not repair or repair.get("summary", {}).get("total_slices", 0) == 0:
        return ""
    s = repair["summary"]
    lines = [
        "## Self-Healing",
        "",
        f'**{s["resolved"]}/{s["total_slices"]}** resolved '
        f'(max level: L{s["max_level_used"]}, cost: ${s["total_cost_usd"]:.2f})',
        "",
    ]

    by_level = s.get("by_level", {})
    if by_level:
        lines.append("| Level | Attempted | Resolved |")
        lines.append("|-------|:---------:|:--------:|")
        for lvl in ["L1", "L2", "L3", "L4"]:
            if lvl in by_level:
                lines.append(f'| {lvl} | {by_level[lvl]["attempted"]} | {by_level[lvl]["resolved"]} |')
        lines.append("")

    for r in repair.get("repairs", []):
        icon = "\u2705" if r.get("resolved") else "\u274c"
        lvl = r.get("resolved_at_level", 0)
        detail = f"L{lvl}" if r.get("resolved") else "unresolved"
        lines.append(f'- {icon} **{r["slice"]}**: {r["failure_class"]} \u2014 {detail}')

    return "\n".join(lines)


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--context", required=True)
    parser.add_argument("--slices", required=True)
    parser.add_argument("--base-branch", required=True)
    args = parser.parse_args()

    conf = load_json("/tmp/confidence.json")
    repair = load_json("/tmp/repair-results.json")
    risk = load_json("/tmp/risk-scores.json")

    sections = [
        summary_section(args.context, args.slices, args.base_branch),
        confidence_section(conf),
        review_guide_section(conf, repair, risk),
        healing_section(repair),
        "",
        "---",
        "*Generated by evdb CI pipeline v3 (risk-aware, self-healing, explainable)*",
    ]

    print("\n\n".join(s for s in sections if s))


if __name__ == "__main__":
    main()
