#!/usr/bin/env python3
"""
confidence_scorer.py — Deterministic confidence scoring for evdb CI pipeline.

Produces per-slice confidence scores (0-100) with bands and recommendations.
100% deterministic — no AI calls. All weights and thresholds from ci_config.json.

Exit codes:
  0 — scoring complete
  1 — internal error

Usage:
  python3 confidence_scorer.py \
    --verify /tmp/verify-results.json \
    --test-passed true \
    --slices "funddeposit,approvewithdrawal" \
    [--classification /tmp/classification.json] \
    [--repair /tmp/repair-results.json] \
    [--claude-stats /tmp/claude-stats.txt]
"""

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path


SCRIPTS_DIR = Path(__file__).parent
CONFIG_PATH = SCRIPTS_DIR / "ci_config.json"


def load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text())
    # Fallback defaults
    return {
        "confidence": {
            "weights": {
                "verify_pass": 30,
                "test_pass": 30,
                "no_todos_remaining": 10,
                "no_repair_needed": 10,
                "repair_succeeded": 5,
                "diff_boundary_clean": 5,
                "scan_session_clean": 5,
                "token_anomaly_penalty": -5,
                "turn_anomaly_penalty": -5,
            },
            "thresholds": {"token_anomaly": 80000, "turn_anomaly": 30},
            "bands": {"HIGH": 80, "MEDIUM": 50, "LOW": 20, "BLOCKED": 0},
            "recommendations": {
                "HIGH": "Ready for review",
                "MEDIUM": "Review with attention to flagged areas",
                "LOW": "Significant concerns — manual inspection required",
                "BLOCKED": "Do not merge — critical failures unresolved",
            },
        }
    }


@dataclass
class SliceScore:
    slice_name: str
    score: int
    band: str
    reasons: list[str] = field(default_factory=list)
    recommended_action: str = ""
    signals: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Signal extractors
# ---------------------------------------------------------------------------

def extract_verify_signals(verify_data: list[dict], slice_name: str) -> dict:
    """Extract signals from verify output for a specific slice."""
    for entry in verify_data:
        if entry.get("slice") == slice_name:
            checks = entry.get("checks", [])
            todo_checks = [c for c in checks if "todos_remaining" in c.get("check", "")]
            has_todos = any(c["status"] == "WARN" for c in todo_checks)

            return {
                "verify_passed": entry.get("passed", False),
                "verify_fail_count": entry.get("fail_count", 0),
                "verify_warn_count": entry.get("warn_count", 0),
                "has_todos": has_todos,
            }
    # Slice not in verify output — might be OK (projection, etc.)
    return {
        "verify_passed": True,
        "verify_fail_count": 0,
        "verify_warn_count": 0,
        "has_todos": False,
    }


def extract_classification_signals(classification_data: dict, slice_name: str) -> dict:
    """Extract signals from classification output."""
    classifications = classification_data.get("classifications", [])
    for c in classifications:
        if c.get("slice_name") == slice_name:
            return {
                "has_failure": True,
                "failure_class": c.get("failure_class", "unknown"),
                "deterministic_classification": c.get("deterministic", True),
            }
    return {
        "has_failure": False,
        "failure_class": None,
        "deterministic_classification": True,
    }


def extract_repair_signals(repair_data: dict, slice_name: str) -> dict:
    """Extract signals from repair output."""
    repairs = repair_data.get("repairs", [])
    for r in repairs:
        if r.get("slice_name") == slice_name:
            return {
                "repair_attempted": True,
                "repair_succeeded": r.get("repaired", False),
                "repair_ai_used": r.get("ai_used", False),
                "repair_files_touched": len(r.get("files_touched", [])),
                "repair_diff_size": r.get("diff_size", 0),
            }
    return {
        "repair_attempted": False,
        "repair_succeeded": False,
        "repair_ai_used": False,
        "repair_files_touched": 0,
        "repair_diff_size": 0,
    }


def extract_claude_signals(claude_stats: dict) -> dict:
    """Extract signals from Claude Code stats."""
    return {
        "total_tokens": claude_stats.get("total_tokens", 0),
        "num_turns": claude_stats.get("num_turns", 0),
        "cost_usd": claude_stats.get("cost", 0),
    }


def parse_claude_stats_file(stats_path: Path) -> dict:
    """Parse key=value stats file from CI."""
    stats = {}
    if not stats_path.exists():
        return stats
    for line in stats_path.read_text().strip().split("\n"):
        if "=" in line:
            key, val = line.split("=", 1)
            try:
                stats[key.strip()] = float(val.strip())
            except ValueError:
                stats[key.strip()] = val.strip()
    return stats


# ---------------------------------------------------------------------------
# Scoring engine
# ---------------------------------------------------------------------------

def score_slice(
    slice_name: str,
    verify_signals: dict,
    test_passed: bool,
    classification_signals: dict,
    repair_signals: dict,
    claude_signals: dict,
    config: dict,
) -> SliceScore:
    """Compute confidence score for a single slice."""
    weights = config["confidence"]["weights"]
    thresholds = config["confidence"]["thresholds"]
    bands_config = config["confidence"]["bands"]
    recommendations = config["confidence"]["recommendations"]

    score = 0
    reasons = []
    signals = {}

    # Signal: verify pass
    if verify_signals["verify_passed"]:
        score += weights["verify_pass"]
        signals["verify_pass"] = True
    else:
        reasons.append(f"Verification failed ({verify_signals['verify_fail_count']} failures)")
        signals["verify_pass"] = False

    # Signal: test pass
    if test_passed:
        score += weights["test_pass"]
        signals["test_pass"] = True
    else:
        reasons.append("Tests failed")
        signals["test_pass"] = False

    # Signal: no TODOs remaining
    if not verify_signals.get("has_todos", False):
        score += weights["no_todos_remaining"]
        signals["no_todos"] = True
    else:
        reasons.append("TODO comments remain in generated code")
        signals["no_todos"] = False

    # Signal: no repair needed
    if not classification_signals.get("has_failure", False):
        score += weights["no_repair_needed"]
        signals["no_repair_needed"] = True
    else:
        signals["no_repair_needed"] = False
        # But if repair succeeded, partial credit
        if repair_signals.get("repair_succeeded", False):
            score += weights["repair_succeeded"]
            reasons.append(f"Self-healed: {repair_signals.get('repair_files_touched', 0)} file(s) patched")
            signals["repair_succeeded"] = True
        elif repair_signals.get("repair_attempted", False):
            reasons.append("Repair attempted but failed")
            signals["repair_succeeded"] = False

    # Signal: diff boundary clean (no repair touched unexpected files)
    if not repair_signals.get("repair_attempted", False) or repair_signals.get("repair_diff_size", 0) <= 20:
        score += weights["diff_boundary_clean"]
        signals["diff_boundary_clean"] = True
    else:
        reasons.append(f"Repair diff was large: {repair_signals['repair_diff_size']} lines")
        signals["diff_boundary_clean"] = False

    # Signal: scan session clean (placeholder — always true if no scan data)
    score += weights["scan_session_clean"]
    signals["scan_session_clean"] = True

    # Penalty: token anomaly
    total_tokens = claude_signals.get("total_tokens", 0)
    if total_tokens > thresholds["token_anomaly"]:
        score += weights["token_anomaly_penalty"]  # negative
        reasons.append(f"High token usage: {int(total_tokens):,}")
        signals["token_anomaly"] = True
    else:
        signals["token_anomaly"] = False

    # Penalty: turn anomaly
    num_turns = claude_signals.get("num_turns", 0)
    if num_turns > thresholds["turn_anomaly"]:
        score += weights["turn_anomaly_penalty"]  # negative
        reasons.append(f"High turn count: {int(num_turns)}")
        signals["turn_anomaly"] = True
    else:
        signals["turn_anomaly"] = False

    # Clamp to 0-100
    score = max(0, min(100, score))

    # Determine band
    band = "BLOCKED"
    for band_name in ("HIGH", "MEDIUM", "LOW", "BLOCKED"):
        if score >= bands_config[band_name]:
            band = band_name
            break

    return SliceScore(
        slice_name=slice_name,
        score=score,
        band=band,
        reasons=reasons if reasons else ["All checks passed"],
        recommended_action=recommendations[band],
        signals=signals,
    )


def score_all_slices(
    slice_names: list[str],
    verify_data: list[dict],
    test_passed: bool,
    classification_data: dict,
    repair_data: dict,
    claude_stats: dict,
    config: dict,
) -> list[SliceScore]:
    """Score all slices in a context."""
    results = []
    for name in slice_names:
        verify_sig = extract_verify_signals(verify_data, name)
        class_sig = extract_classification_signals(classification_data, name)
        repair_sig = extract_repair_signals(repair_data, name)
        claude_sig = extract_claude_signals(claude_stats)

        score = score_slice(
            name, verify_sig, test_passed, class_sig, repair_sig, claude_sig, config
        )
        results.append(score)
    return results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Deterministic confidence scorer for evdb CI")
    parser.add_argument("--verify", help="Path to verify --json output")
    parser.add_argument("--test-passed", default="true", help="Whether tests passed (true/false)")
    parser.add_argument("--slices", required=True, help="Comma-separated slice names")
    parser.add_argument("--classification", help="Path to classification JSON")
    parser.add_argument("--repair", help="Path to repair results JSON")
    parser.add_argument("--claude-stats", help="Path to Claude stats key=value file")
    args = parser.parse_args()

    config = load_config()
    slice_names = [s.strip() for s in args.slices.split(",") if s.strip()]

    # Load verify data
    verify_data = []
    if args.verify:
        path = Path(args.verify)
        if path.exists():
            try:
                data = json.loads(path.read_text())
                verify_data = data if isinstance(data, list) else [data]
            except (json.JSONDecodeError, ValueError):
                pass

    # Load classification
    classification_data = {}
    if args.classification:
        path = Path(args.classification)
        if path.exists():
            try:
                classification_data = json.loads(path.read_text())
            except (json.JSONDecodeError, ValueError):
                pass

    # Load repair results
    repair_data = {}
    if args.repair:
        path = Path(args.repair)
        if path.exists():
            try:
                repair_data = json.loads(path.read_text())
            except (json.JSONDecodeError, ValueError):
                pass

    # Load Claude stats
    claude_stats = {}
    if args.claude_stats:
        claude_stats = parse_claude_stats_file(Path(args.claude_stats))

    test_passed = args.test_passed.lower() in ("true", "1", "yes")

    scores = score_all_slices(
        slice_names, verify_data, test_passed,
        classification_data, repair_data, claude_stats, config
    )

    # Aggregate context-level summary
    avg_score = sum(s.score for s in scores) / len(scores) if scores else 0
    worst_band = "HIGH"
    band_order = {"BLOCKED": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3}
    for s in scores:
        if band_order.get(s.band, 0) < band_order.get(worst_band, 3):
            worst_band = s.band

    output = {
        "slices": [s.to_dict() for s in scores],
        "context_summary": {
            "average_score": round(avg_score, 1),
            "worst_band": worst_band,
            "total_slices": len(scores),
            "high_confidence": sum(1 for s in scores if s.band == "HIGH"),
            "medium_confidence": sum(1 for s in scores if s.band == "MEDIUM"),
            "low_confidence": sum(1 for s in scores if s.band == "LOW"),
            "blocked": sum(1 for s in scores if s.band == "BLOCKED"),
        },
    }

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
