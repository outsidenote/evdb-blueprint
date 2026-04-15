#!/usr/bin/env python3
"""Read generate_slices.py output and produce a GitHub Actions matrix JSON.

Usage:
  python3 .ci/plan_matrix.py < /tmp/generate-output.json

Outputs to stdout: {"include": [...]} matrix JSON
Sets GITHUB_OUTPUT vars: has_contexts, matrix
"""
import json, os, sys

def main():
    data = json.load(sys.stdin)
    total = data["total_planned"]
    github_output = os.environ.get("GITHUB_OUTPUT", "")

    if total == 0:
        if github_output:
            with open(github_output, "a") as f:
                f.write("has_contexts=false\n")
                f.write("matrix={}\n")
        print("No planned slices found.", file=sys.stderr)
        return

    base = data["base_branch"]
    contexts = []
    for ctx, info in data["contexts"].items():
        if info["planned_slices"]:
            contexts.append({
                "context": ctx,
                "context_pascal": info["context_pascal"],
                "branch": info["branch"],
                "base_branch": base,
                "slices": ",".join(info["planned_slices"]),
                "split_files": " ".join(info["split_files"]),
                "index_file": info["index_file"],
            })

    matrix = json.dumps({"include": contexts})
    if github_output:
        with open(github_output, "a") as f:
            f.write("has_contexts=true\n")
            f.write(f"matrix={matrix}\n")
    print(matrix)

if __name__ == "__main__":
    main()
