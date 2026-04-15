#!/usr/bin/env python3
"""Extract confidence summary fields to GITHUB_OUTPUT.

Usage:
  python3 .ci/extract_confidence.py
"""
import json, os

github_output = os.environ.get("GITHUB_OUTPUT", "")

try:
    data = json.load(open("/tmp/confidence.json"))
    ctx = data["context_summary"]
    lines = [
        f"avg_score={ctx['average_score']}",
        f"worst_band={ctx['worst_band']}",
        f"high={ctx['high_confidence']}",
        f"medium={ctx['medium_confidence']}",
        f"low={ctx['low_confidence']}",
        f"blocked={ctx['blocked']}",
    ]
    if github_output:
        with open(github_output, "a") as f:
            f.write("\n".join(lines) + "\n")
    for line in lines:
        print(line)
except Exception:
    pass
