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


# ── Ambiguity classes eligible for clarification ────────────────

SEMANTIC_FAILURE_CLASSES = {
    "test_failure", "predicate_mismatch", "missing_handler_branch",
    "verification_failure",
}
INFRA_FAILURE_CLASSES = {
    "flaky_or_env", "import_error", "path_error",
}

# Question templates keyed by failure pattern
QUESTION_TEMPLATES = {
    "wrong_event": (
        "When {condition}, should the system emit **{expected}** or **{actual}**?\n\n"
        "- The test (derived from spec) expects `{expected}`\n"
        "- The current implementation produces `{actual}`\n\n"
        "**Spec source:** {spec_ref}"
    ),
    "wrong_value": (
        "For `{field}`, the test expects `{expected}` but the code produces `{actual}`.\n\n"
        "**Question:** Which calculation is correct for this field?\n\n"
        "**Spec source:** {spec_ref}"
    ),
    "generic": (
        "The test for **{slice}** fails after repair.\n\n"
        "**Expected:** {expected}\n"
        "**Actual:** {actual}\n\n"
        "**Question:** Is the spec description complete for this behavior?\n\n"
        "**Spec source:** {spec_ref}"
    ),
}


def _parse_expected_actual(error_text: str) -> tuple[str, str]:
    """Extract expected and actual values from test error output.

    Handles multiple assertion output formats:
    - TAP: expected: X / actual: Y
    - Node test runner: + actual / - expected
    - deepStrictEqual: { field: value } diffs
    """
    expected = ""
    actual = ""
    for line in error_text.splitlines():
        stripped = line.strip()
        # TAP / assert format
        if stripped.startswith("expected:") or stripped.startswith("- expected"):
            expected = stripped[:200]
        elif stripped.startswith("actual:") or stripped.startswith("+ actual"):
            actual = stripped[:200]
        # Node diff format (- for expected, + for actual)
        elif stripped.startswith("-   ") and not expected:
            expected = stripped[:200]
        elif stripped.startswith("+   ") and not actual:
            actual = stripped[:200]
        # deepStrictEqual key: value diff
        elif "expected:" in stripped and not expected:
            expected = stripped[:200]
        elif "actual:" in stripped and not actual:
            actual = stripped[:200]

    # If still empty, grab the first meaningful chunk of the error
    if not expected and not actual and error_text.strip():
        lines = [l.strip() for l in error_text.splitlines() if l.strip() and not l.strip().startswith("at ")]
        chunk = "\n".join(lines[:5])
        return chunk[:200], ""

    return expected or "(no expected value parsed)", actual or "(no actual value parsed)"


def _classify_unresolved(failure_class: str) -> str:
    """Classify an unresolved failure into one of three bins."""
    if failure_class in SEMANTIC_FAILURE_CLASSES:
        return "clarification_needed"
    if failure_class in INFRA_FAILURE_CLASSES:
        return "infra_issue"
    return "engineering_defect"


def _fingerprint_failure(expected: str, actual: str) -> str:
    """Create a fingerprint for deduplication of similar failures.

    Groups failures that have the same shape (e.g., all boundary condition
    issues, all wrong event types) even across different slices.
    """
    if "eventType" in expected and "eventType" in actual:
        return "wrong_event"
    # Extract field names from expected/actual for grouping
    # e.g., "riskWeight: 0.8625" and "riskWeight: 0.75" → "wrong_value:riskWeight"
    import re
    field_match = re.search(r"(\w+):\s*[\d.]", expected)
    if field_match:
        return f"wrong_value:{field_match.group(1)}"
    return "generic"


def generate_clarifications(
    repair: dict | None,
    classification: dict | None,
    test_results: dict | None,
) -> list[dict]:
    """Generate structured clarification records for unresolved semantic failures.

    Deduplicates by:
    1. Slice name (one question per slice)
    2. Failure fingerprint (groups similar failures across slices)

    Returns a list of clarification dicts, each with:
      slice(s), failure_class, bin, question, expected, actual, spec_ref
    """
    if not repair:
        return []

    # Build lookup: slice → test result for error details
    test_errors: dict[str, str] = {}
    if test_results:
        for r in test_results.get("results", []):
            if not r.get("passed"):
                test_errors[r.get("slice", "")] = r.get("error", "")

    # First pass: collect all unresolved semantic failures
    raw_failures: list[dict] = []
    seen_slices: set[str] = set()

    for r in repair.get("repairs", []):
        if r.get("resolved"):
            continue

        slice_name = r.get("slice", "")
        fc = r.get("failure_class", "")
        failure_bin = _classify_unresolved(fc)

        if failure_bin != "clarification_needed":
            continue
        if slice_name in seen_slices:
            continue
        seen_slices.add(slice_name)

        error_text = test_errors.get(slice_name, "")
        expected, actual = _parse_expected_actual(error_text)
        fp = _fingerprint_failure(expected, actual)

        raw_failures.append({
            "slice": slice_name,
            "failure_class": fc,
            "bin": failure_bin,
            "expected": expected[:200],
            "actual": actual[:200],
            "fingerprint": fp,
            "spec_ref": f"{slice_name}/slice.json",
        })

    # Second pass: group by fingerprint to deduplicate similar failures
    groups: dict[str, list[dict]] = {}
    for f in raw_failures:
        groups.setdefault(f["fingerprint"], []).append(f)

    # Generate one clarification per group
    clarifications: list[dict] = []
    for fp, failures in groups.items():
        if len(failures) == 1:
            f = failures[0]
            slices_text = f["slice"]
        else:
            slices_text = ", ".join(f["slice"] for f in failures)

        primary = failures[0]

        # Pick question template
        if fp == "wrong_event":
            template = QUESTION_TEMPLATES["wrong_event"]
        elif fp.startswith("wrong_value:"):
            template = QUESTION_TEMPLATES["wrong_value"]
        else:
            template = QUESTION_TEMPLATES["generic"]

        question = template.format(
            slice=slices_text,
            condition=f"the {primary['slice']} command is processed",
            field=fp.split(":")[-1] if ":" in fp else "(see diff above)",
            expected=primary["expected"][:150],
            actual=primary["actual"][:150],
            spec_ref=f"`slice.json` > specifications / description",
        )

        # If grouped, add evidence from all slices
        if len(failures) > 1:
            evidence = "\n".join(
                f"- **{f['slice']}**: expected `{f['expected'][:80]}`, got `{f['actual'][:80]}`"
                for f in failures
            )
            question += f"\n\n**Affected slices ({len(failures)}):**\n{evidence}"

        clarifications.append({
            "slices": [f["slice"] for f in failures],
            "failure_class": primary["failure_class"],
            "bin": primary["bin"],
            "fingerprint": fp,
            "question": question,
            "expected": primary["expected"],
            "actual": primary["actual"],
            "spec_ref": primary["spec_ref"],
        })

    return clarifications


def _load_spec_locations(clarifications: list[dict]) -> list[dict]:
    """Load Miro element IDs from slice.json for each clarification."""
    locations: list[dict] = []
    seen: set[str] = set()

    for c in clarifications:
        for slice_name in c.get("slices", []):
            if slice_name in seen:
                continue
            seen.add(slice_name)

            # Try to find slice.json
            for em_dir in (".eventmodel", ".eventmodel2"):
                # Search all contexts
                em_path = Path(em_dir) / ".slices"
                if not em_path.exists():
                    continue
                for ctx_dir in em_path.iterdir():
                    if not ctx_dir.is_dir():
                        continue
                    for slice_dir in ctx_dir.iterdir():
                        if slice_dir.name.lower() == slice_name.lower():
                            spec_path = slice_dir / "slice.json"
                            if spec_path.exists():
                                try:
                                    spec = json.load(open(spec_path))
                                    locations.append({
                                        "slice": slice_name,
                                        "path": str(spec_path),
                                        "miro_id": spec.get("id", "?"),
                                        "context": spec.get("context", "?"),
                                        "title": spec.get("title", "?"),
                                    })
                                except Exception:
                                    pass
    return locations


def clarification_section(
    repair: dict | None,
    classification: dict | None,
    test_results: dict | None,
) -> str:
    """Render clarification requests for unresolved semantic failures."""
    clarifications = generate_clarifications(repair, classification, test_results)
    if not clarifications:
        return ""

    # Write structured artifact for machine readability
    try:
        from pathlib import Path as P
        artifact = {
            "status": "clarification_needed",
            "count": len(clarifications),
            "clarifications": clarifications,
        }
        P("/tmp/clarifications.json").write_text(
            json.dumps(artifact, indent=2, default=str) + "\n"
        )
    except Exception:
        pass

    # Count by bin
    engineering = [c for c in clarifications if c["bin"] == "engineering_defect"]
    infra = [c for c in clarifications if c["bin"] == "infra_issue"]

    lines = [
        "## Clarification Needed",
        "",
        "The following could not be resolved automatically. "
        "Please clarify the spec in Miro and re-trigger the pipeline.",
        "",
    ]

    for i, c in enumerate(clarifications, 1):
        slices_label = ", ".join(c.get("slices", [c.get("slice", "?")]))
        lines.append(f"### {i}. {slices_label} — `{c['failure_class']}`")
        lines.append("")
        lines.append(c["question"])
        lines.append("")

    # Load slice IDs for Miro references
    spec_locations = _load_spec_locations(clarifications)
    if spec_locations:
        lines.append("### Spec Locations")
        lines.append("")
        lines.append("| Miro Name | Context | Config Path | Miro ID |")
        lines.append("|-----------|---------|-------------|---------|")
        for loc in spec_locations:
            lines.append(f"| **{loc['title']}** | {loc['context']} | `{loc['path']}` | `{loc['miro_id']}` |")
        lines.append("")

    lines.append("> **How to resolve:** Update the spec description in Miro for the affected slice, "
                 "re-export `config.json`, push, and re-trigger the pipeline via `workflow_dispatch`.")

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
    classification = load_json("/tmp/classification.json")
    test_results = load_json("/tmp/test-results.json")

    sections = [
        summary_section(args.context, args.slices, args.base_branch),
        confidence_section(conf),
        clarification_section(repair, classification, test_results),
        review_guide_section(conf, repair, risk),
        healing_section(repair),
        "",
        "---",
        "*Generated by evdb CI pipeline v3 (risk-aware, self-healing, explainable)*",
    ]

    print("\n\n".join(s for s in sections if s))


if __name__ == "__main__":
    main()
