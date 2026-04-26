#!/usr/bin/env python3
"""Stage helper: structural MCP descriptor checks.

Runs after evdb-verify in `verify_and_test.py`. Pure file-scanning — no AI,
no external deps, no Postgres/Kafka — so it is safe to run in any CI shape
that already runs evdb-verify.

Output shape mirrors evdb-verify so results merge cleanly into
`/tmp/verify-results.json`. classify.py already routes unknown check names
(`mcp_*`) to VERIFICATION_FAILURE, and the repair ladder picks them up
unmodified.

Two checks per MCP descriptor file:

  • mcp_description_filled       — no @DESCRIPTION_TODO sentinel remaining
                                   (set by evdb-scaffold; replaced by the
                                   AI fill step in implement_slice.py)
  • mcp_endpoint_reconciled      — for command descriptors, the declared
                                   routePath has a matching `router.<verb>`
                                   line in the per-context routes.ts
  • mcp_projection_reconciled    — for projection descriptors, the declared
                                   projectionName appears in the per-context
                                   projections.ts aggregator

Slices/contexts that haven't adopted MCP scaffolding yet produce empty
output — additive rollout, never blocks pre-MCP code.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any


DESCRIPTION_TODO_SENTINEL = "@DESCRIPTION_TODO"

# evdb-verify status codes (mirrored to keep the merged JSON consistent)
PASS = "PASS"
WARN = "WARN"
FAIL = "FAIL"


def run_mcp_checks(root: Path, context: str) -> tuple[bool, list[dict]]:
    """Run structural MCP checks for one BusinessCapability context.

    Returns (all_passed, slice_reports). slice_reports is a list of dicts
    in evdb-verify's shape: {slice, passed, checks: [{file, check, status, detail}]}.

    Empty list when the context has no MCP descriptor files — caller should
    leave verify-results.json untouched in that case.
    """
    bc_dir = root / "src" / "BusinessCapabilities" / context
    if not bc_dir.exists():
        return True, []

    cmd_descriptors = sorted(bc_dir.glob("endpoints/*/MCP/index.ts"))
    query_descriptors = sorted(bc_dir.glob("slices/*/mcp.ts"))

    if not cmd_descriptors and not query_descriptors:
        return True, []

    routes_text = _read_text_safe(bc_dir / "endpoints" / "routes.ts")
    projections_text = _read_text_safe(bc_dir / "slices" / "projections.ts")

    reports: list[dict] = []
    all_passed = True

    for path in cmd_descriptors:
        slice_name = path.parent.parent.name  # endpoints/<Slice>/MCP/index.ts
        report, passed = _check_command_descriptor(path, root, slice_name, routes_text)
        reports.append(report)
        all_passed = all_passed and passed

    for path in query_descriptors:
        slice_name = path.parent.name  # slices/<Slice>/mcp.ts
        report, passed = _check_query_descriptor(path, root, slice_name, projections_text)
        reports.append(report)
        all_passed = all_passed and passed

    return all_passed, reports


def merge_into_verify(verify_data: Any, mcp_reports: list[dict]) -> list[dict]:
    """Append MCP check rows onto matching slice entries in verify-results.json.

    For each MCP report:
      • If a slice with the same name exists in verify_data, append its checks
        and recompute `passed`.
      • If not, append the report as a new top-level slice entry.

    Defensive against unexpected verify_data shapes (returns a list either way).
    """
    if not isinstance(verify_data, list):
        verify_data = []

    by_slice: dict[str, dict] = {}
    for entry in verify_data:
        if isinstance(entry, dict) and "slice" in entry:
            by_slice[entry["slice"]] = entry

    for report in mcp_reports:
        existing = by_slice.get(report["slice"])
        if existing is not None:
            existing.setdefault("checks", []).extend(report["checks"])
            existing["passed"] = all(
                c.get("status") in (PASS, WARN)
                for c in existing["checks"]
            )
        else:
            verify_data.append(report)

    return verify_data


# ── Internals ────────────────────────────────────────────────────

def _read_text_safe(path: Path) -> str:
    try:
        return path.read_text() if path.exists() else ""
    except OSError:
        return ""


def _make_report(slice_name: str, checks: list[dict]) -> tuple[dict, bool]:
    passed = all(c["status"] in (PASS, WARN) for c in checks)
    return {"slice": slice_name, "passed": passed, "checks": checks}, passed


def _sentinel_check(rel: str, text: str) -> dict:
    if DESCRIPTION_TODO_SENTINEL in text:
        return {
            "file": rel,
            "check": "mcp_description_filled",
            "status": FAIL,
            "detail": (
                f"{DESCRIPTION_TODO_SENTINEL} sentinel still present — "
                "AI fill step did not run or its output was discarded"
            ),
        }
    return {"file": rel, "check": "mcp_description_filled", "status": PASS, "detail": ""}


def _check_command_descriptor(
    path: Path, root: Path, slice_name: str, routes_text: str,
) -> tuple[dict, bool]:
    rel = str(path.relative_to(root))
    text = _read_text_safe(path)
    checks: list[dict] = [_sentinel_check(rel, text)]

    m = re.search(r'routePath\s*:\s*[\'"]([^\'"]+)[\'"]', text)
    if not m:
        checks.append({
            "file": rel,
            "check": "mcp_endpoint_reconciled",
            "status": WARN,
            "detail": "could not extract routePath from descriptor",
        })
    else:
        route = m.group(1)
        # Look for a matching router.<verb>("<route>", ...) registration.
        pattern = re.compile(
            r'router\.(?:get|post|put|patch|delete)\s*\(\s*[\'"]'
            + re.escape(route) + r'[\'"]'
        )
        if routes_text and pattern.search(routes_text):
            checks.append({
                "file": rel,
                "check": "mcp_endpoint_reconciled",
                "status": PASS,
                "detail": "",
            })
        else:
            checks.append({
                "file": rel,
                "check": "mcp_endpoint_reconciled",
                "status": FAIL,
                "detail": (
                    f"routePath '{route}' has no matching router.<verb> "
                    "registration in endpoints/routes.ts"
                ),
            })

    return _make_report(slice_name, checks)


def _check_query_descriptor(
    path: Path, root: Path, slice_name: str, projections_text: str,
) -> tuple[dict, bool]:
    rel = str(path.relative_to(root))
    text = _read_text_safe(path)
    checks: list[dict] = [_sentinel_check(rel, text)]

    m = re.search(r'projectionName\s*:\s*[\'"]([^\'"]+)[\'"]', text)
    if not m:
        checks.append({
            "file": rel,
            "check": "mcp_projection_reconciled",
            "status": WARN,
            "detail": "could not extract projectionName from descriptor",
        })
    else:
        proj = m.group(1)
        if projections_text and proj in projections_text:
            checks.append({
                "file": rel,
                "check": "mcp_projection_reconciled",
                "status": PASS,
                "detail": "",
            })
        else:
            checks.append({
                "file": rel,
                "check": "mcp_projection_reconciled",
                "status": FAIL,
                "detail": (
                    f"projectionName '{proj}' not registered in "
                    "slices/projections.ts"
                ),
            })

    return _make_report(slice_name, checks)
