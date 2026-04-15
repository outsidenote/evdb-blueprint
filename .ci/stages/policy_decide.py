#!/usr/bin/env python3
"""Stage: Policy engine — evaluate rules, produce per-slice decisions.

Deterministic. Reads risk scores + policy config, outputs decisions.json.
Also outputs the enhanced matrix for GitHub Actions (with policy decisions baked in).

Usage:
    python3 .ci/stages/policy_decide.py \
        --risk-scores /tmp/risk-scores.json \
        --generate-output /tmp/generate-output.json \
        --trigger push \
        --model-override auto \
        --provider anthropic
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.contracts import (
    DECISIONS, POLICY_CONFIG, PolicyDecision, PolicyAction,
    load_json, load_config, write_json, set_output,
)
from lib.audit import emit


# ── Rule evaluation ──────────────────────────────────────────────

def evaluate_condition(condition: dict, ctx: dict) -> bool:
    """Evaluate a policy rule condition against slice context.

    Condition keys:
        risk_score_gte, risk_score_lt  — numeric comparisons
        trigger                        — must match exactly
        prior_runs_eq                  — exact match
        last_3_passed                  — bool flag
    """
    for key, expected in condition.items():
        if key == "risk_score_gte":
            if ctx.get("risk_score", 0) < expected:
                return False
        elif key == "risk_score_lt":
            if ctx.get("risk_score", 0) >= expected:
                return False
        elif key == "trigger":
            if ctx.get("trigger") != expected:
                return False
        elif key == "prior_runs_eq":
            if ctx.get("prior_runs", -1) != expected:
                return False
        elif key == "last_3_passed":
            if ctx.get("last_3_passed", False) != expected:
                return False
    return True


def resolve_model_id(model: str, provider: str, model_resolution: dict) -> str:
    """Resolve abstract model name to concrete API model ID."""
    provider_map = model_resolution.get(provider, model_resolution.get("anthropic", {}))
    return provider_map.get(model, "")


def decide_slice(
    slice_name: str,
    context: str,
    risk_score: float,
    trigger: str,
    model_override: str,
    provider: str,
    rules: list[dict],
    model_resolution: dict,
) -> PolicyDecision:
    """Evaluate policy rules for one slice. First matching rule wins."""

    # Build context for rule evaluation
    # Lite run intelligence: default to unknown (prior_runs=-1 means no data)
    ctx = {
        "risk_score": risk_score,
        "trigger": trigger,
        "prior_runs": -1,        # -1 = unknown (lite mode — no intel store yet)
        "last_3_passed": False,  # conservative default
    }

    # Find first matching rule
    for rule in rules:
        if evaluate_condition(rule["condition"], ctx):
            # If model_override is set and not "auto", it overrides the rule's model
            model = rule.get("model", "auto")
            if model_override and model_override != "auto":
                model = model_override

            model_id = resolve_model_id(model, provider, model_resolution)

            return PolicyDecision(
                slice=slice_name,
                context=context,
                action=rule.get("action", PolicyAction.APPROVE.value),
                rule_matched=rule["name"],
                reason=rule.get("reason", ""),
                model=model,
                model_id=model_id,
                max_budget_usd=rule.get("max_budget_usd", 2.00),
                max_turns=rule.get("max_turns", 20),
                repair_depth=rule.get("repair_depth", 3),
                pr_mode=rule.get("pr_mode", "draft"),
                risk_score=risk_score,
            )

    # No rule matched — block as safety default
    return PolicyDecision(
        slice=slice_name,
        context=context,
        action=PolicyAction.BLOCK.value,
        rule_matched="__no_match__",
        reason="No policy rule matched — blocked by default",
        model="",
        model_id="",
        max_budget_usd=0,
        max_turns=0,
        repair_depth=0,
        pr_mode="draft",
        risk_score=risk_score,
    )


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Policy engine — per-slice decisions")
    parser.add_argument("--risk-scores", required=True)
    parser.add_argument("--generate-output", required=True)
    parser.add_argument("--trigger", default="push")
    parser.add_argument("--model-override", default="auto")
    parser.add_argument("--provider", default="anthropic")
    args = parser.parse_args()

    risk_data = load_json(Path(args.risk_scores))
    gen_output = load_json(Path(args.generate_output))

    # Load policy config
    try:
        policy_config = load_config(POLICY_CONFIG)
    except FileNotFoundError:
        print("WARNING: policy.json not found, using permissive defaults", file=sys.stderr)
        policy_config = {
            "rules": [{"name": "default_approve", "condition": {}, "action": "approve",
                        "model": "auto", "max_budget_usd": 2.00, "max_turns": 20,
                        "repair_depth": 3, "pr_mode": "draft", "reason": "default"}],
            "guardrails": {"max_total_cost_per_run_usd": 15.00, "max_slices_per_run": 20},
            "model_resolution": {"anthropic": {"opus": "", "sonnet": "claude-sonnet-4-6-20250514"}},
        }

    rules = policy_config.get("rules", [])
    guardrails = policy_config.get("guardrails", {})
    model_resolution = policy_config.get("model_resolution", {})

    # Build risk lookup
    risk_lookup: dict[str, float] = {}
    for score in risk_data.get("scores", []):
        risk_lookup[score["slice"]] = score["score"]

    # Evaluate each slice
    decisions: list[PolicyDecision] = []
    contexts = gen_output.get("contexts", {})

    for ctx_name, ctx_info in contexts.items():
        ctx_pascal = ctx_info.get("context_pascal", ctx_name)
        for slice_folder in ctx_info.get("planned_slices", []):
            risk = risk_lookup.get(slice_folder, 0.5)

            decision = decide_slice(
                slice_name=slice_folder,
                context=ctx_pascal,
                risk_score=risk,
                trigger=args.trigger,
                model_override=args.model_override,
                provider=args.provider,
                rules=rules,
                model_resolution=model_resolution,
            )
            decisions.append(decision)

            # Audit every decision
            emit("policy_decision", "policy_engine",
                 slice=slice_folder, context=ctx_pascal,
                 data={
                     "action": decision.action,
                     "rule": decision.rule_matched,
                     "model": decision.model,
                     "budget": decision.max_budget_usd,
                     "repair_depth": decision.repair_depth,
                     "risk_score": risk,
                 })

    # Check guardrails
    total_estimated = sum(d.max_budget_usd for d in decisions if d.action != PolicyAction.BLOCK.value)
    max_cost = guardrails.get("max_total_cost_per_run_usd", 15.00)
    max_slices = guardrails.get("max_slices_per_run", 20)
    active_slices = [d for d in decisions if d.action != PolicyAction.BLOCK.value]

    if len(active_slices) > max_slices:
        print(f"WARNING: {len(active_slices)} slices exceed max {max_slices}", file=sys.stderr)

    # Write decisions
    output = {
        "run_id": "",  # set by GITHUB_RUN_ID at runtime
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "trigger": args.trigger,
        "model_override": args.model_override,
        "guardrails": {
            "max_total_cost_usd": max_cost,
            "max_slices": max_slices,
            "estimated_cost_usd": round(total_estimated, 2),
        },
        "decisions": [d.to_dict() for d in decisions],
        "summary": {
            "total": len(decisions),
            "approved": sum(1 for d in decisions if d.action == "approve"),
            "gated": sum(1 for d in decisions if d.action == "gate"),
            "blocked": sum(1 for d in decisions if d.action == "block"),
            "escalated": sum(1 for d in decisions if d.action == "escalate"),
            "estimated_cost_usd": round(total_estimated, 2),
        },
    }
    write_json(DECISIONS, output)

    # Build enhanced matrix for GitHub Actions
    # (same format as v2 but with policy data attached)
    base = gen_output.get("base_branch", "main")
    matrix_entries = []

    for ctx_name, ctx_info in contexts.items():
        ctx_pascal = ctx_info.get("context_pascal", ctx_name)
        planned = ctx_info.get("planned_slices", [])

        # Filter out blocked slices
        active = [s for s in planned
                  if any(d.slice == s and d.action != "block" for d in decisions)]

        if not active:
            continue

        # Determine PR mode: if ANY slice in this context is gated → draft
        any_gated = any(d.slice in active and d.action == "gate" for d in decisions)

        matrix_entries.append({
            "context": ctx_name,
            "context_pascal": ctx_pascal,
            "branch": ctx_info.get("branch", f"{base}-codegen/{ctx_pascal}"),
            "base_branch": base,
            "slices": ",".join(active),
            "index_file": ctx_info.get("index_file", ""),
            "pr_mode": "draft" if any_gated else "ready",
        })

    matrix = json.dumps({"include": matrix_entries})

    set_output("matrix", matrix)
    set_output("has_contexts", str(bool(matrix_entries)).lower())
    set_output("blocked_slices", str(output["summary"]["blocked"]))
    set_output("total_estimated_cost", str(round(total_estimated, 2)))

    # Print summary
    s = output["summary"]
    print(f"Policy: {s['total']} slices — {s['approved']} approved, {s['gated']} gated, {s['blocked']} blocked", file=sys.stderr)
    print(f"Estimated cost: ${total_estimated:.2f} / ${max_cost:.2f} limit", file=sys.stderr)


if __name__ == "__main__":
    main()
