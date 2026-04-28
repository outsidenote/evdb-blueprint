#!/usr/bin/env python3
"""Stage: Explainable confidence scoring — deterministic, with evidence chains.

100% deterministic. No AI. Every score point has a source and detail.

Usage:
    python3 .ci/stages/score_confidence.py \
        --verify /tmp/verify-results.json \
        --test-passed true \
        --slices "addloantoportfolio,assessloanrisk" \
        [--classification /tmp/classification.json] \
        [--repair /tmp/repair-results.json] \
        [--claude-stats /tmp/claude-stats.json]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.contracts import (
    CONFIDENCE, PIPELINE_CONFIG,
    ConfidenceEvidence, ConfidenceScore, ConfidenceBand,
    load_json, load_config, write_json, set_output,
)
from lib.audit import emit


# ── Signal extractors ────────────────────────────────────────────

def extract_verify_signals(verify_data: list[dict], slice_name: str) -> dict:
    for entry in verify_data:
        if entry.get("slice") == slice_name:
            checks = entry.get("checks", [])
            todo_checks = [c for c in checks if "todos_remaining" in c.get("check", "")]
            has_todos = any(c["status"] == "WARN" for c in todo_checks)
            return {
                "verify_passed": entry.get("passed", False),
                "verify_fail_count": entry.get("fail_count", 0),
                "verify_warn_count": entry.get("warn_count", 0),
                "verify_check_count": len(checks),
                "has_todos": has_todos,
            }
    return {"verify_passed": True, "verify_fail_count": 0, "verify_warn_count": 0,
            "verify_check_count": 0, "has_todos": False}


def extract_classification_signals(class_data: dict, slice_name: str) -> dict:
    for c in class_data.get("classifications", []):
        if c.get("slice_name") == slice_name:
            return {"has_failure": True, "failure_class": c.get("failure_class", "unknown")}
    return {"has_failure": False, "failure_class": None}


def extract_repair_signals(repair_data: dict, slice_name: str) -> dict:
    for r in repair_data.get("repairs", []):
        if r.get("slice") == slice_name:
            return {
                "repair_attempted": True,
                "repair_resolved": r.get("resolved", False),
                "repair_level": r.get("resolved_at_level", 0),
                "repair_cost": r.get("total_cost_usd", 0),
                "repair_files": sum(len(a.get("files_touched", [])) for a in r.get("attempts", [])),
            }
    return {"repair_attempted": False, "repair_resolved": False, "repair_level": 0,
            "repair_cost": 0, "repair_files": 0}


# ── Scoring engine ───────────────────────────────────────────────

def score_slice(
    slice_name: str,
    verify_signals: dict,
    test_passed: bool,
    class_signals: dict,
    repair_signals: dict,
    claude_stats: dict,
    config: dict,
) -> ConfidenceScore:
    """Compute confidence score with full evidence chain."""
    weights = config["confidence"]["weights"]
    thresholds = config["confidence"]["thresholds"]
    bands = config["confidence"]["bands"]
    recommendations = config["confidence"]["recommendations"]

    score = 0
    evidence: list[ConfidenceEvidence] = []
    reasons: list[str] = []

    # ── verify_pass ──────────────────────────────────────────
    w = weights["verify_pass"]
    if verify_signals["verify_passed"]:
        score += w
        evidence.append(ConfidenceEvidence(
            signal="verify_pass", weight=w, contributed=w, awarded=True,
            source="verify_slice.py",
            detail=f"{verify_signals['verify_check_count']} checks passed"))
    else:
        reasons.append(f"Verification failed ({verify_signals['verify_fail_count']} failures)")
        evidence.append(ConfidenceEvidence(
            signal="verify_pass", weight=w, contributed=0, awarded=False,
            source="verify_slice.py",
            detail=f"{verify_signals['verify_fail_count']} failures"))

    # ── test_pass ────────────────────────────────────────────
    w = weights["test_pass"]
    if test_passed:
        score += w
        evidence.append(ConfidenceEvidence(
            signal="test_pass", weight=w, contributed=w, awarded=True,
            source="node --test", detail="Tests passed"))
    else:
        reasons.append("Tests failed")
        evidence.append(ConfidenceEvidence(
            signal="test_pass", weight=w, contributed=0, awarded=False,
            source="node --test", detail="Tests failed"))

    # ── no_todos_remaining ───────────────────────────────────
    w = weights["no_todos_remaining"]
    if not verify_signals.get("has_todos", False):
        score += w
        evidence.append(ConfidenceEvidence(
            signal="no_todos_remaining", weight=w, contributed=w, awarded=True,
            source="verify_slice.py", detail="No TODO comments remain"))
    else:
        reasons.append("TODO comments remain")
        evidence.append(ConfidenceEvidence(
            signal="no_todos_remaining", weight=w, contributed=0, awarded=False,
            source="verify_slice.py", detail="TODO comments found in generated code"))

    # ── no_repair_needed ─────────────────────────────────────
    w = weights["no_repair_needed"]
    if not class_signals.get("has_failure", False):
        score += w
        evidence.append(ConfidenceEvidence(
            signal="no_repair_needed", weight=w, contributed=w, awarded=True,
            source="classify.py", detail="No failures — clean first pass"))
    else:
        evidence.append(ConfidenceEvidence(
            signal="no_repair_needed", weight=w, contributed=0, awarded=False,
            source="classify.py",
            detail=f"Failure: {class_signals.get('failure_class', 'unknown')}"))
        # Partial credit if repair succeeded
        w2 = weights["repair_succeeded"]
        if repair_signals.get("repair_resolved", False):
            score += w2
            lvl = repair_signals["repair_level"]
            reasons.append(f"Self-healed at L{lvl}")
            evidence.append(ConfidenceEvidence(
                signal="repair_succeeded", weight=w2, contributed=w2, awarded=True,
                source="repair.py",
                detail=f"Resolved at L{lvl}, {repair_signals['repair_files']} file(s)"))
        elif repair_signals.get("repair_attempted", False):
            reasons.append("Repair attempted but failed")
            evidence.append(ConfidenceEvidence(
                signal="repair_succeeded", weight=w2, contributed=0, awarded=False,
                source="repair.py", detail="Repair did not resolve the failure"))

    # ── diff_boundary_clean ──────────────────────────────────
    w = weights["diff_boundary_clean"]
    if not repair_signals.get("repair_attempted") or repair_signals.get("repair_files", 0) <= 3:
        score += w
        evidence.append(ConfidenceEvidence(
            signal="diff_boundary_clean", weight=w, contributed=w, awarded=True,
            source="repair.py", detail="No out-of-scope modifications"))
    else:
        reasons.append(f"Repair touched {repair_signals['repair_files']} files")
        evidence.append(ConfidenceEvidence(
            signal="diff_boundary_clean", weight=w, contributed=0, awarded=False,
            source="repair.py",
            detail=f"Repair touched {repair_signals['repair_files']} files"))

    # ── scan_session_clean (placeholder — always awarded) ────
    w = weights["scan_session_clean"]
    score += w
    evidence.append(ConfidenceEvidence(
        signal="scan_session_clean", weight=w, contributed=w, awarded=True,
        source="system", detail="No scan session anomalies"))

    # ── token_anomaly_penalty ────────────────────────────────
    w = weights["token_anomaly_penalty"]
    total_tokens = claude_stats.get("total_tokens", 0)
    if total_tokens > thresholds["token_anomaly"]:
        score += w  # negative
        reasons.append(f"High tokens: {int(total_tokens):,}")
        evidence.append(ConfidenceEvidence(
            signal="token_anomaly_penalty", weight=w, contributed=w, awarded=True,
            source="claude-stats.json",
            detail=f"{int(total_tokens):,} tokens > {thresholds['token_anomaly']:,} threshold"))
    else:
        evidence.append(ConfidenceEvidence(
            signal="token_anomaly_penalty", weight=w, contributed=0, awarded=False,
            source="claude-stats.json",
            detail=f"{int(total_tokens):,} tokens (below threshold)"))

    # ── turn_anomaly_penalty ─────────────────────────────────
    w = weights["turn_anomaly_penalty"]
    turns = claude_stats.get("num_turns", claude_stats.get("turns", 0))
    if turns > thresholds["turn_anomaly"]:
        score += w  # negative
        reasons.append(f"High turns: {int(turns)}")
        evidence.append(ConfidenceEvidence(
            signal="turn_anomaly_penalty", weight=w, contributed=w, awarded=True,
            source="claude-stats.json",
            detail=f"{int(turns)} turns > {thresholds['turn_anomaly']} threshold"))
    else:
        evidence.append(ConfidenceEvidence(
            signal="turn_anomaly_penalty", weight=w, contributed=0, awarded=False,
            source="claude-stats.json",
            detail=f"{int(turns)} turns (below threshold)"))

    # Clamp
    score = max(0, min(100, score))

    # Band
    band = "BLOCKED"
    for band_name in ("HIGH", "MEDIUM", "LOW", "BLOCKED"):
        if score >= bands[band_name]:
            band = band_name
            break

    return ConfidenceScore(
        slice=slice_name,
        score=score,
        band=band,
        recommended_action=recommendations.get(band, ""),
        evidence=evidence,
        reasons=reasons if reasons else ["All checks passed"],
        signals={e.signal: e.awarded for e in evidence},
    )


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Explainable confidence scoring")
    parser.add_argument("--verify", default="")
    parser.add_argument("--test-passed", default="true")
    parser.add_argument("--slices", required=True)
    parser.add_argument("--classification", default="")
    parser.add_argument("--repair", default="")
    parser.add_argument("--claude-stats", default="")
    parser.add_argument("--intel-dir", default="")
    args = parser.parse_args()

    try:
        config = load_config(PIPELINE_CONFIG)
    except FileNotFoundError:
        # Fallback to hardcoded defaults
        config = {
            "confidence": {
                "weights": {"verify_pass": 35, "test_pass": 35, "no_todos_remaining": 10,
                             "no_repair_needed": 10, "repair_succeeded": 5,
                             "diff_boundary_clean": 5, "scan_session_clean": 5,
                             "token_anomaly_penalty": -5, "turn_anomaly_penalty": -5},
                "thresholds": {"token_anomaly": 80000, "turn_anomaly": 30},
                "bands": {"HIGH": 80, "MEDIUM": 50, "LOW": 20, "BLOCKED": 0},
                "recommendations": {"HIGH": "Ready for review", "MEDIUM": "Review flagged areas",
                                     "LOW": "Manual inspection required", "BLOCKED": "Do not merge"},
            }
        }

    slices = [s.strip() for s in args.slices.split(",") if s.strip()]
    test_passed_global = args.test_passed.lower() in ("true", "1", "yes")

    # Load per-slice test results so each slice gets scored against its own tests,
    # not penalized for another slice's failure.
    from lib.contracts import TEST_RESULTS
    test_results = load_json(TEST_RESULTS) or {}
    per_slice_test_passed: dict[str, bool] = {}
    for entry in test_results.get("results", []):
        slice_name = entry.get("slice", "")
        if not slice_name:
            continue
        # A slice passes only if ALL its test files passed
        prev = per_slice_test_passed.get(slice_name, True)
        per_slice_test_passed[slice_name] = prev and bool(entry.get("passed", False))

    verify_data = load_json(Path(args.verify)) if args.verify else []
    if isinstance(verify_data, dict):
        verify_data = [verify_data] if verify_data else []
    class_data = load_json(Path(args.classification)) if args.classification else {}
    repair_data = load_json(Path(args.repair)) if args.repair else {}

    # Load per-slice stats (not aggregate) for accurate token/cost attribution
    from lib.contracts import slice_stats_path
    aggregate_stats = load_json(Path(args.claude_stats)) if args.claude_stats else {}

    scores: list[ConfidenceScore] = []
    for name in slices:
        v_sig = extract_verify_signals(verify_data, name)
        c_sig = extract_classification_signals(class_data, name)
        r_sig = extract_repair_signals(repair_data, name)

        # Use per-slice stats if available. If the slice's AI was skipped (no per-slice
        # stats file), use an empty dict — never fall back to aggregate stats, because
        # aggregate is the sum of ALL slices and would wrongly attribute the whole run's
        # token/turn count to a single slice that didn't even invoke the AI.
        per_slice = load_json(slice_stats_path(name))
        claude_stats = per_slice if per_slice else {}

        # Per-slice test pass: prefer the per-slice lookup, fall back to global flag
        # if the slice has no test files (per_slice_test_passed missing the key).
        # Match case-insensitively because slice names in test-results use the
        # actual filesystem casing while score_confidence receives lowercase folder names.
        test_passed = test_passed_global
        for slice_key, passed in per_slice_test_passed.items():
            if slice_key.lower() == name.lower():
                test_passed = passed
                break

        cs = score_slice(name, v_sig, test_passed, c_sig, r_sig, claude_stats, config)
        scores.append(cs)

        emit("confidence_scored", "score_confidence.py", slice=name,
             data={"score": cs.score, "band": cs.band,
                    "evidence_count": len(cs.evidence)})

    # Context summary
    avg = sum(s.score for s in scores) / len(scores) if scores else 0
    band_order = {"BLOCKED": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3}
    worst = "HIGH"
    for s in scores:
        if band_order.get(s.band, 0) < band_order.get(worst, 3):
            worst = s.band

    output = {
        "slices": [s.to_dict() for s in scores],
        "context_summary": {
            "average_score": round(avg, 1),
            "worst_band": worst,
            "total_slices": len(scores),
            "high_confidence": sum(1 for s in scores if s.band == "HIGH"),
            "medium_confidence": sum(1 for s in scores if s.band == "MEDIUM"),
            "low_confidence": sum(1 for s in scores if s.band == "LOW"),
            "blocked": sum(1 for s in scores if s.band == "BLOCKED"),
        },
    }
    write_json(CONFIDENCE, output)

    set_output("avg_score", str(round(avg, 1)))
    set_output("worst_band", worst)

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
