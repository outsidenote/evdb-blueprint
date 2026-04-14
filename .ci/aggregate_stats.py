#!/usr/bin/env python3
"""Aggregate per-slice stats into totals and write GITHUB_OUTPUT vars.

Usage:
  python3 .ci/aggregate_stats.py --slices "slice1,slice2,slice3"

Reads /tmp/slice-stats-{name}.txt for each slice.
Writes /tmp/claude-stats.txt and /tmp/claude-summary.txt.
Sets GITHUB_OUTPUT vars: input_tokens, output_tokens, total_tokens, cost, num_turns, api_time_s
"""
import json, os, argparse

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--slices", required=True)
    args = parser.parse_args()

    slices = args.slices.split(",")
    tc, tt, ti, to = 0, 0, 0, 0

    for s in slices:
        try:
            parts = open(f"/tmp/slice-stats-{s}.txt").read().strip().split(",")
            tc += float(parts[0])
            tt += int(parts[1])
            ti += int(parts[2])
            to += int(parts[3])
        except Exception:
            pass

    print(f"Total: {tt} turns, ${tc:.2f}, Input: {ti:,}, Output: {to:,}")

    with open("/tmp/claude-stats.txt", "w") as f:
        f.write(f"input_tokens={ti}\noutput_tokens={to}\ntotal_tokens={ti+to}\ncost={tc:.4f}\nnum_turns={tt}\napi_time_s=0\n")

    # Write combined summary
    summaries = []
    for s in slices:
        try:
            lines = open(f"/tmp/claude-{s}.json").readlines()
            data = json.loads(next(l for l in lines if l.strip().startswith("{")))
            summaries.append(f'{s}: {data.get("result", "no result")[:200]}')
        except Exception:
            pass
    with open("/tmp/claude-summary.txt", "w") as f:
        f.write("\n".join(summaries)[:1000])

    # Write to GITHUB_OUTPUT if available
    github_output = os.environ.get("GITHUB_OUTPUT", "")
    if github_output:
        with open(github_output, "a") as f:
            f.write(f"input_tokens={ti}\noutput_tokens={to}\ntotal_tokens={ti+to}\ncost={tc:.4f}\nnum_turns={tt}\napi_time_s=0\n")

if __name__ == "__main__":
    main()
