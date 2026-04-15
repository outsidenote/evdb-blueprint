#!/usr/bin/env python3
"""Write GitHub Actions job summary with Mermaid diagram and confidence table.

Usage:
  python3 .ci/write_summary.py \
    --summary-path "$GITHUB_STEP_SUMMARY" \
    --context Portfolio \
    --duration "5m 30s" \
    --cost "1.50" \
    --turns "35" \
    --repaired "0"
"""
import json, argparse

BAND_EMOJI = {"HIGH": "\U0001f7e2", "MEDIUM": "\U0001f7e1", "LOW": "\U0001f7e0", "BLOCKED": "\U0001f534"}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--summary-path", required=True)
    parser.add_argument("--context", required=True)
    parser.add_argument("--duration", default="")
    parser.add_argument("--cost", default="0")
    parser.add_argument("--turns", default="0")
    parser.add_argument("--repaired", default="0")
    args = parser.parse_args()

    try:
        conf = json.load(open("/tmp/confidence.json"))
    except Exception:
        conf = {}

    slices = conf.get("slices", [])
    ctx = conf.get("context_summary", {})
    band = ctx.get("worst_band", "UNKNOWN")

    lines = []
    lines.append(f"## {args.context} \u2014 Code Generation Report")
    lines.append("")
    lines.append("```mermaid")
    lines.append("graph LR")
    lines.append("  A[Miro Export] --> B[Split + Normalize]")
    lines.append("  B --> C[evdb-diff]")
    lines.append("  C --> D[evdb-scaffold]")
    lines.append("  D --> E[Claude AI Fill]")
    lines.append("  E --> F[Verify + Test]")
    if int(args.repaired) > 0:
        lines.append("  F -->|failures| G[Self-Heal]")
        lines.append("  G --> F")
    lines.append("  F --> H[PR]")
    color = "2ea44f" if band in ("HIGH", "MEDIUM") else "da3633"
    lines.append(f"  style H fill:#{color},color:#fff")
    lines.append("```")
    lines.append("")

    emoji = BAND_EMOJI.get(band, "\u26aa")
    lines.append(f"**{emoji} {band}** \u2014 {args.duration} \u2014 ${args.cost} \u2014 {args.turns} turns")
    if int(args.repaired) > 0:
        lines.append(f" \u2014 {args.repaired} self-healed")
    lines.append("")

    lines.append("| Slice | Score | Status | Action |")
    lines.append("|:------|:-----:|:------:|:-------|")
    for s in slices:
        e = BAND_EMOJI.get(s.get("band", ""), "\u26aa")
        lines.append(f"| `{s['slice_name']}` | **{s['score']}** | {e} | {s['recommended_action']} |")

    flagged = [s for s in slices if s.get("reasons") and s["reasons"] != ["All checks passed"]]
    if flagged:
        lines.append("")
        lines.append("<details><summary>Flags</summary>")
        lines.append("")
        for s in flagged:
            lines.append(f"**{s['slice_name']}**")
            for r in s["reasons"]:
                lines.append(f"- {r}")
        lines.append("")
        lines.append("</details>")

    lines.append("")

    with open(args.summary_path, "a") as f:
        f.write("\n".join(lines) + "\n")

if __name__ == "__main__":
    main()
