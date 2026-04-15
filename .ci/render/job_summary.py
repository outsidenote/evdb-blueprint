#!/usr/bin/env python3
"""Render GitHub Actions job summary with Mermaid diagram.

Usage:
    python3 .ci/render/job_summary.py \
        --summary-path "$GITHUB_STEP_SUMMARY" \
        --context Portfolio --duration "5m 30s" \
        --cost "1.50" --turns "35" --repaired "0" --max-repair-level "0"
"""
from __future__ import annotations

import argparse
import json

BAND_EMOJI = {"HIGH": "\U0001f7e2", "MEDIUM": "\U0001f7e1", "LOW": "\U0001f7e0", "BLOCKED": "\U0001f534"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--summary-path", required=True)
    parser.add_argument("--context", required=True)
    parser.add_argument("--duration", default="")
    parser.add_argument("--cost", default="0")
    parser.add_argument("--turns", default="0")
    parser.add_argument("--repaired", default="0")
    parser.add_argument("--max-repair-level", default="0")
    parser.add_argument("--mode", default="live")
    args = parser.parse_args()

    try:
        conf = json.load(open("/tmp/confidence.json"))
    except Exception:
        conf = {}

    slices = conf.get("slices", [])
    ctx = conf.get("context_summary", {})
    band = ctx.get("worst_band", "UNKNOWN")
    repair_level = int(args.max_repair_level or 0)

    lines = [f"## {args.context} — Pipeline Report", ""]

    # Mermaid
    lines.append("```mermaid")
    lines.append("graph LR")
    lines.append("  A[Miro Export] --> B[Split + Scaffold]")
    lines.append("  B --> C[Risk Score]")
    lines.append("  C --> D[Policy Engine]")
    lines.append("  D --> E[AI Fill]")
    lines.append("  E --> F[Verify + Test]")
    if repair_level >= 1:
        lines.append("  F -->|fail| G[L1 Det Fix]")
        if repair_level >= 2:
            lines.append("  G -->|fail| H[L2 AI Sonnet]")
            if repair_level >= 3:
                lines.append("  H -->|fail| I[L3 AI Opus]")
                lines.append("  I --> F")
            else:
                lines.append("  H --> F")
        else:
            lines.append("  G --> F")
    lines.append("  F -->|pass| J[PR]")
    color = "2ea44f" if band in ("HIGH", "MEDIUM") else "da3633"
    lines.append(f"  style J fill:#{color},color:#fff")
    lines.append("```")
    lines.append("")

    # Summary line
    emoji = BAND_EMOJI.get(band, "\u26aa")
    repair_str = f" — L{repair_level} repair" if int(args.repaired) > 0 else ""
    lines.append(f"**{emoji} {band}** — {args.duration} — ${args.cost} — {args.turns} turns{repair_str}")
    lines.append("")

    # Per-slice table
    if slices:
        lines.append("| Slice | Score | Band | Action |")
        lines.append("|:------|:-----:|:----:|:-------|")
        for s in slices:
            e = BAND_EMOJI.get(s.get("band", ""), "\u26aa")
            lines.append(f"| `{s['slice']}` | **{s['score']}** | {e} | {s['recommended_action']} |")

    # Flags
    flagged = [s for s in slices if s.get("reasons") and s["reasons"] != ["All checks passed"]]
    if flagged:
        lines.append("")
        lines.append("<details><summary>Flags</summary>")
        lines.append("")
        for s in flagged:
            lines.append(f"**{s['slice']}**")
            for r in s["reasons"]:
                lines.append(f"- {r}")
        lines.append("")
        lines.append("</details>")

    lines.append("")

    with open(args.summary_path, "a") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
