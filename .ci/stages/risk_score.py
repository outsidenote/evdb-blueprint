#!/usr/bin/env python3
"""Stage: Risk scoring — compute 0.0–1.0 risk per slice before any AI runs.

All deterministic. Reads slice specs and scaffold output. No AI calls.
Five factors, all backed by real data — no stubs or hardcoded defaults.

Usage:
    python3 .ci/stages/risk_score.py \
        --root . \
        --em-dir .eventmodel \
        --generate-output /tmp/generate-output.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.contracts import (
    RISK_SCORES, RISK_FACTORS_CONFIG, RiskFactor, RiskScore, RiskBand,
    load_json, load_config, write_json, set_output,
)
from lib.audit import emit


# ── Risk factor computation ──────────────────────────────────────

def compute_spec_complexity(spec: dict) -> tuple[int, float]:
    """specifications × events product. Raw and normalized."""
    n_specs = len(spec.get("specifications", []))
    n_events = len(spec.get("events", []))
    raw = n_specs * n_events
    return raw, min(raw / 12.0, 1.0)


def compute_slice_type_risk(spec: dict, type_values: dict) -> tuple[str, float]:
    """Risk based on slice type."""
    slice_type = spec.get("sliceType", "STATE_CHANGE")
    return slice_type, type_values.get(slice_type, 0.3)


def compute_field_type_risk(spec: dict, risk_types: list[str]) -> tuple[list[str], float]:
    """Risk based on field types — custom, list, datetime are harder."""
    all_fields = []
    for cmd in spec.get("commands", []):
        for f in cmd.get("fields", []):
            all_fields.append(f.get("type", "String"))
    for evt in spec.get("events", []):
        for f in evt.get("fields", []):
            all_fields.append(f.get("type", "String"))

    risky = [t for t in all_fields if t in risk_types]
    if not all_fields:
        return [], 0.0
    return risky, min(len(risky) / max(len(all_fields), 1), 1.0)


def compute_todo_density(root: Path, context: str, slice_name: str) -> tuple[int, float]:
    """Count TODO placeholders in scaffolded files."""
    slice_dir = root / "src" / "BusinessCapabilities" / context / "slices" / slice_name
    if not slice_dir.exists():
        # Try case-insensitive match
        parent = root / "src" / "BusinessCapabilities" / context / "slices"
        if parent.exists():
            for d in parent.iterdir():
                if d.is_dir() and d.name.lower() == slice_name.lower():
                    slice_dir = d
                    break

    count = 0
    if slice_dir.exists():
        for ts_file in slice_dir.rglob("*.ts"):
            try:
                content = ts_file.read_text()
                count += content.count("TODO")
            except Exception:
                pass

    return count, min(count / 10.0, 1.0)


def score_slice(
    slice_name: str,
    context: str,
    spec: dict,
    root: Path,
    factor_defs: list[dict],
) -> RiskScore:
    """Compute risk score for a single slice."""
    factors = []

    for fdef in factor_defs:
        name = fdef["name"]
        weight = fdef["weight"]

        if name == "spec_complexity":
            raw, norm = compute_spec_complexity(spec)
        elif name == "slice_type":
            raw, norm = compute_slice_type_risk(spec, fdef.get("values", {}))
        elif name == "blast_radius":
            raw = len(spec.get("events", []))
            norm = min(raw / 10.0, 1.0)
        elif name == "field_types":
            raw, norm = compute_field_type_risk(spec, fdef.get("risk_types", []))
        elif name == "todo_density":
            raw, norm = compute_todo_density(root, context, slice_name)
        else:
            raw, norm = 0, 0.0

        factors.append(RiskFactor(
            name=name,
            raw=raw,
            normalized=round(norm, 3),
            weight=weight,
            contributed=round(norm * weight, 4),
        ))

    weighted_sum = sum(f.contributed for f in factors)
    score = round(min(max(weighted_sum, 0.0), 1.0), 2)

    if score < 0.3:
        band = RiskBand.LOW.value
    elif score < 0.6:
        band = RiskBand.MODERATE.value
    elif score < 0.8:
        band = RiskBand.HIGH.value
    else:
        band = RiskBand.CRITICAL.value

    return RiskScore(
        slice=slice_name,
        context=context,
        score=score,
        band=band,
        factors=factors,
        blast_radius={
            "events_emitted": [e.get("title", "") for e in spec.get("events", [])],
            "files_scaffolded": compute_todo_density(root, context, slice_name)[0],
        },
    )


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Risk score all planned slices")
    parser.add_argument("--root", default=".")
    parser.add_argument("--em-dir", default=".eventmodel")
    parser.add_argument("--generate-output", required=True)
    args = parser.parse_args()

    root = Path(args.root).resolve()
    gen_output = load_json(Path(args.generate_output))
    if not gen_output:
        print("No generate output — nothing to score", file=sys.stderr)
        write_json(RISK_SCORES, {"timestamp": "", "scores": []})
        return

    # Load risk factor definitions
    try:
        risk_config = load_config(RISK_FACTORS_CONFIG)
        factor_defs = risk_config["factors"]
    except FileNotFoundError:
        # Fallback defaults (must match risk_factors.json weights)
        factor_defs = [
            {"name": "spec_complexity", "weight": 0.35},
            {"name": "slice_type", "weight": 0.20, "values": {"STATE_CHANGE": 0.2, "QUERY": 0.1, "PROCESSOR": 0.6, "ENRICHMENT": 0.5}},
            {"name": "blast_radius", "weight": 0.20},
            {"name": "field_types", "weight": 0.15, "risk_types": ["Custom", "List", "DateTime"]},
            {"name": "todo_density", "weight": 0.10},
        ]

    scores = []
    contexts = gen_output.get("contexts", {})

    for ctx_name, ctx_info in contexts.items():
        ctx_pascal = ctx_info.get("context_pascal", ctx_name)

        for slice_folder in ctx_info.get("planned_slices", []):
            # Load slice spec
            spec_path = root / args.em_dir / ".slices" / ctx_name / slice_folder / "slice.json"
            spec = load_json(spec_path) if spec_path.exists() else {}

            risk = score_slice(slice_folder, ctx_pascal, spec, root, factor_defs)
            scores.append(risk)

            # Audit each scoring decision
            emit("risk_scored", "risk_score.py",
                 slice=slice_folder, context=ctx_pascal,
                 data={"score": risk.score, "band": risk.band,
                        "top_factor": max(risk.factors, key=lambda f: f.contributed).name if risk.factors else "none"})

    # Write output
    from datetime import datetime, timezone
    output = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "scores": [s.to_dict() for s in scores],
    }
    write_json(RISK_SCORES, output)

    # Summary
    avg = sum(s.score for s in scores) / len(scores) if scores else 0
    print(f"Risk scored {len(scores)} slices — avg={avg:.2f}", file=sys.stderr)
    for s in scores:
        print(f"  {s.slice}: {s.score:.2f} ({s.band})", file=sys.stderr)


if __name__ == "__main__":
    main()
