#!/usr/bin/env python3
"""Extract stats from a Claude Code JSON output file.

Usage:
  python3 .ci/extract_claude_stats.py /tmp/claude-SLICE.json [--slice-name NAME]

Prints per-slice stats to stdout.
Writes cost,turns,input,output to /tmp/slice-stats-{NAME}.txt
"""
import json, sys, argparse

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("json_file")
    parser.add_argument("--slice-name", default="unknown")
    args = parser.parse_args()

    stats_file = f"/tmp/slice-stats-{args.slice_name}.txt"
    try:
        lines = open(args.json_file).readlines()
        data = json.loads(next(l for l in lines if l.strip().startswith("{")))
        u = data.get("usage", {})
        inp = u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0)
        out = u.get("output_tokens", 0)
        cost = data.get("total_cost_usd", 0)
        turns = data.get("num_turns", 0)
        print(f"  Turns: {turns}, Cost: ${cost:.2f}, Input: {inp:,}, Output: {out:,}")
        with open(stats_file, "w") as f:
            f.write(f"{cost},{turns},{inp},{out}")
    except Exception as e:
        print(f"  Stats error: {e}")
        with open(stats_file, "w") as f:
            f.write("0,0,0,0")

if __name__ == "__main__":
    main()
