#!/usr/bin/env python3
"""Aggregate per-slice stats into totals.

Usage:
  python3 .ci/aggregate_stats.py --slices "slice1,slice2,slice3"

Reads /tmp/slice-stats-{name}.json for each slice.
Writes /tmp/claude-stats.json (full) and /tmp/claude-summary.txt (text).
Sets GITHUB_OUTPUT vars.
"""
import json, os, argparse

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--slices", required=True)
    args = parser.parse_args()

    slices = args.slices.split(",")
    totals = {"cost": 0, "turns": 0, "input_tokens": 0, "output_tokens": 0}
    summaries = []

    for s in slices:
        try:
            stats = json.load(open(f"/tmp/slice-stats-{s}.json"))
            totals["cost"] += stats.get("cost", 0)
            totals["turns"] += stats.get("turns", 0)
            totals["input_tokens"] += stats.get("input_tokens", 0)
            totals["output_tokens"] += stats.get("output_tokens", 0)
            if stats.get("result"):
                summaries.append(f"{s}: {stats['result']}")
        except Exception:
            pass

    totals["total_tokens"] = totals["input_tokens"] + totals["output_tokens"]
    print(f"Total: {totals['turns']} turns, ${totals['cost']:.2f}, Input: {totals['input_tokens']:,}, Output: {totals['output_tokens']:,}")

    # Write JSON stats
    with open("/tmp/claude-stats.json", "w") as f:
        json.dump(totals, f, indent=2)

    # Write summary text
    with open("/tmp/claude-summary.txt", "w") as f:
        f.write("\n".join(summaries)[:1000])

    # Also write flat key=value for GITHUB_OUTPUT compatibility
    github_output = os.environ.get("GITHUB_OUTPUT", "")
    kv_lines = [
        f"input_tokens={totals['input_tokens']}",
        f"output_tokens={totals['output_tokens']}",
        f"total_tokens={totals['total_tokens']}",
        f"cost={totals['cost']:.4f}",
        f"num_turns={totals['turns']}",
        f"api_time_s=0",
    ]
    if github_output:
        with open(github_output, "a") as f:
            f.write("\n".join(kv_lines) + "\n")

if __name__ == "__main__":
    main()
