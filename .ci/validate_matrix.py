#!/usr/bin/env python3
"""Validate a GitHub Actions matrix JSON has required keys.

Usage:
  echo '{"include":[...]}' | python3 .ci/validate_matrix.py
"""
import json, sys

REQUIRED_KEYS = ("context", "branch", "slices", "index_file")

data = json.load(sys.stdin)
assert "include" in data, "Missing include key"
for ctx in data["include"]:
    for key in REQUIRED_KEYS:
        assert key in ctx, f"Missing {key} in context entry"
print(f'Matrix valid: {len(data["include"])} contexts')
