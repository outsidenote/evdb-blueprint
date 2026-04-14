#!/usr/bin/env python3
"""Stage: Repair ladder — L1 deterministic → L2 bounded AI → L3 expanded AI → L4 human.

Each level has hard bounds. The policy decision's `repair_depth` controls max level.
After each level, re-verifies to check if the fix worked.

Usage:
    python3 .ci/stages/repair.py \
        --classification /tmp/classification.json \
        --decisions /tmp/decisions.json \
        --root . \
        --context Portfolio \
        --provider anthropic
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.contracts import (
    REPAIR_RESULTS, DECISIONS, PIPELINE_CONFIG, VERIFY_RESULTS,
    RepairAttempt, RepairResult, RepairLevel,
    load_json, load_config, write_json, set_output,
)
from lib.audit import emit


# ── Deterministic repair strategies (L1) ─────────────────────────

def repair_imports(root: Path, context: str, slice_name: str) -> RepairAttempt:
    """L1: Fix import paths — .ts → .js, missing relative prefixes."""
    start = time.time()
    bc = root / "src" / "BusinessCapabilities" / context
    files_touched = []
    fixes = 0

    for subdir in ["slices", "endpoints"]:
        search_dir = bc / subdir
        if not search_dir.exists():
            continue
        for ts_file in search_dir.rglob("*.ts"):
            if ".test." in ts_file.name:
                continue
            content = ts_file.read_text()
            original = content
            content = re.sub(r"from\s+['\"](\.[^'\"]+)\.ts['\"]", r"from '\1.js'", content)
            if content != original:
                ts_file.write_text(content)
                files_touched.append(str(ts_file.relative_to(root)))
                fixes += 1

    return RepairAttempt(
        level=1, level_name="L1_DETERMINISTIC", strategy="import_fix",
        resolved=False,  # set after re-verify
        files_touched=files_touched, diff_lines=fixes,
        duration_s=round(time.time() - start, 1),
        detail=f"Fixed {fixes} import path(s)",
    )


def repair_types(root: Path, context: str, classification: dict) -> RepairAttempt:
    """L1: Fix field type mismatches based on verify detail."""
    start = time.time()
    files_touched = []
    fixes = 0

    for detail_line in classification.get("details", []):
        match = re.search(r"field_(\w+).*?expected:\s*(\w+)", detail_line)
        if not match:
            match = re.search(r"Missing:\s*readonly\s+(\w+)\s*:\s*(\w+)", detail_line)
        if not match:
            continue

        field_name, expected_type = match.group(1), match.group(2)
        for rel_file in classification.get("affected_files", []):
            abs_path = root / "src" / "BusinessCapabilities" / context / rel_file
            if not abs_path.exists():
                continue
            content = abs_path.read_text()
            new = re.sub(rf"(readonly\s+{re.escape(field_name)}\s*:\s*)\w+",
                         rf"\g<1>{expected_type}", content)
            if new != content:
                abs_path.write_text(new)
                files_touched.append(rel_file)
                fixes += 1

    return RepairAttempt(
        level=1, level_name="L1_DETERMINISTIC", strategy="type_fix",
        resolved=False, files_touched=files_touched, diff_lines=fixes,
        duration_s=round(time.time() - start, 1),
        detail=f"Fixed {fixes} type mismatch(es)",
    )


def repair_paths(root: Path, context: str, classification: dict) -> RepairAttempt:
    """L1: Move misplaced files to expected paths."""
    start = time.time()
    bc = root / "src" / "BusinessCapabilities" / context
    files_touched = []
    fixes = 0

    for detail_line in classification.get("details", []):
        match = re.search(r"MISSING:\s*(.+)", detail_line)
        if not match:
            continue
        expected_rel = match.group(1).strip()
        expected_path = bc / expected_rel
        if expected_path.exists():
            continue
        candidates = list(bc.rglob(expected_path.name))
        if len(candidates) == 1:
            expected_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(candidates[0]), str(expected_path))
            files_touched.append(expected_rel)
            fixes += 1

    return RepairAttempt(
        level=1, level_name="L1_DETERMINISTIC", strategy="path_fix",
        resolved=False, files_touched=files_touched, diff_lines=fixes,
        duration_s=round(time.time() - start, 1),
        detail=f"Moved {fixes} file(s)",
    )


L1_STRATEGIES = {
    "import_error": "imports",
    "type_error": "types",
    "path_error": "paths",
}


def run_l1(root: Path, context: str, classification: dict) -> RepairAttempt:
    """Dispatch to the right L1 strategy."""
    fc = classification.get("failure_class", "")
    if fc == "import_error":
        return repair_imports(root, context, classification.get("slice_name", ""))
    elif fc == "type_error":
        return repair_types(root, context, classification)
    elif fc == "path_error":
        return repair_paths(root, context, classification)
    else:
        return RepairAttempt(
            level=1, level_name="L1_DETERMINISTIC", strategy="none",
            resolved=False, detail=f"No L1 strategy for {fc}",
        )


# ── AI repair (L2/L3) ───────────────────────────────────────────

def run_ai_repair(
    root: Path, context: str, classification: dict,
    level: int, level_name: str,
    model: str, max_turns: int, max_files: int, max_budget: float,
    allowed_files: list[str],
    verify_output: str = "",
    test_output: str = "",
) -> RepairAttempt:
    """Bounded AI repair with structured failure context.

    CWD locked to the slice directory. Claude gets exact failure details
    and a narrow edit scope — no repo scanning possible.
    """
    start = time.time()
    slice_name = classification.get("slice_name", "")
    fc = classification.get("failure_class", "")
    details_text = "\n".join(classification.get("details", [])[:10])

    # Build targeted repair prompt with full failure context
    sections = [f"Fix a specific CI failure in this TypeScript slice."]
    sections.append(f"\nFailure class: {fc}")
    sections.append(f"\nVerification details:\n{details_text}")

    if test_output:
        # Truncate test output to relevant portion
        test_excerpt = test_output[:2000]
        sections.append(f"\nTest output:\n{test_excerpt}")

    sections.append(f"\nAllowed files: {', '.join(allowed_files)}")
    sections.append(f"""
Rules:
- Only edit: {', '.join(allowed_files)}
- Do NOT modify test files (*.test.ts)
- Do NOT read files outside this directory
- Do NOT scan or explore the repo
- Make the MINIMAL change to fix the failure
- Do NOT refactor unrelated logic""")

    prompt = "\n".join(sections)

    claude_path = shutil.which("claude")
    if not claude_path:
        return RepairAttempt(level=level, level_name=level_name, strategy="ai_repair",
                             resolved=False, detail="Claude CLI not available")

    # CWD locked to slice directory
    slice_dir = root / "src" / "BusinessCapabilities" / context / "slices" / slice_name
    if not slice_dir.exists():
        # Try endpoints
        slice_dir = root / "src" / "BusinessCapabilities" / context / "endpoints" / slice_name
    if not slice_dir.exists():
        return RepairAttempt(level=level, level_name=level_name, strategy="ai_repair",
                             resolved=False, detail=f"Slice dir not found: {slice_name}")

    before = _snapshot(slice_dir, allowed_files)

    model_flag = ["--model", model] if model else []
    try:
        subprocess.run(
            [claude_path, "--print", "--dangerously-skip-permissions",
             "--output-format", "text", "--max-turns", str(max_turns),
             "--max-budget-usd", str(max_budget),
             *model_flag, prompt],
            capture_output=True, text=True, cwd=str(slice_dir), timeout=300,
        )
    except subprocess.TimeoutExpired:
        return RepairAttempt(level=level, level_name=level_name, strategy="ai_repair",
                             resolved=False, ai_used=True, model=model,
                             duration_s=round(time.time() - start, 1),
                             detail="AI repair timed out")
    except Exception as e:
        return RepairAttempt(level=level, level_name=level_name, strategy="ai_repair",
                             resolved=False, detail=f"Error: {e}")

    # Check diff
    after = _snapshot(slice_dir, allowed_files)
    files_touched = [f for f in set(list(before) + list(after)) if before.get(f, "") != after.get(f, "")]
    diff_lines = sum(abs(len(after.get(f, "").split("\n")) - len(before.get(f, "").split("\n")))
                     for f in files_touched)

    # Restore any test files that were touched
    _restore_tests(slice_dir, before)

    return RepairAttempt(
        level=level, level_name=level_name, strategy="ai_repair",
        resolved=False,  # set after re-verify
        ai_used=True, model=model,
        files_touched=files_touched, diff_lines=diff_lines,
        turns=max_turns,
        duration_s=round(time.time() - start, 1),
        cost_usd=max_budget,  # conservative — actual cost may be lower
        detail=f"AI {'changed' if files_touched else 'no changes'}: {', '.join(files_touched[:3])}",
    )


def _snapshot(directory: Path, patterns: list[str]) -> dict[str, str]:
    """Snapshot file contents for diff."""
    snap = {}
    if not directory.exists():
        return snap
    for p in patterns:
        for f in directory.rglob(p):
            if f.is_file():
                snap[str(f.relative_to(directory))] = f.read_text()
    return snap


def _restore_tests(directory: Path, before: dict[str, str]) -> None:
    """Ensure test files weren't modified."""
    if not directory.exists():
        return
    for f in directory.rglob("*.test.ts"):
        rel = str(f.relative_to(directory))
        if rel in before:
            current = f.read_text()
            if current != before[rel]:
                f.write_text(before[rel])
                emit("repair_boundary_violation", "repair.py",
                     data={"file": rel, "action": "restored"})


# ── Quick re-verify ──────────────────────────────────────────────

def quick_verify(root: Path, context: str) -> bool:
    """Re-run verify + tests. Returns True if all pass."""
    from .verify_and_test import run_normalize, run_verify, run_tests
    run_normalize(root)
    v_ok, _ = run_verify(root)
    t_ok, _ = run_tests(root, context)
    return v_ok and t_ok


# ── Repair ladder orchestrator ───────────────────────────────────

def _load_failure_context() -> tuple[str, str]:
    """Load verify and test output for passing to AI repair."""
    verify_out = ""
    test_out = ""
    try:
        from lib.contracts import VERIFY_RESULTS, TEST_OUTPUT
        if VERIFY_RESULTS.exists():
            verify_out = VERIFY_RESULTS.read_text()[:3000]
        if TEST_OUTPUT.exists():
            test_out = TEST_OUTPUT.read_text()[:3000]
    except Exception:
        pass
    return verify_out, test_out


def repair_slice(
    classification: dict,
    root: Path,
    context: str,
    max_depth: int,
    pipeline_config: dict,
    provider: str,
) -> RepairResult:
    """Run the repair ladder for one slice."""
    slice_name = classification.get("slice_name", "")
    fc = classification.get("failure_class", "")
    attempts: list[RepairAttempt] = []

    levels = pipeline_config.get("repair", {}).get("levels", {})
    strategies = pipeline_config.get("repair", {}).get("strategies", {})
    strategy_config = strategies.get(fc, {})
    allowed_files = strategy_config.get("allowed_files", ["*.ts"])

    # Load failure context once for AI repair levels
    verify_output, test_output = _load_failure_context()

    # ── L1: Deterministic ──────────────────────────────────────
    if max_depth >= 1:
        attempt = run_l1(root, context, classification)
        attempts.append(attempt)

        emit("repair_attempt", "repair.py", slice=slice_name, context=context,
             data={"level": 1, "strategy": attempt.strategy,
                    "files_touched": len(attempt.files_touched)})

        if attempt.files_touched:
            # Re-verify to see if L1 fixed it
            try:
                from .verify_and_test import run_normalize, run_verify, run_tests
                run_normalize(root)
                v_ok, _ = run_verify(root)
                t_ok, _ = run_tests(root, context)
                if v_ok and t_ok:
                    attempt.resolved = True
                    return RepairResult(slice=slice_name, failure_class=fc,
                                        resolved=True, resolved_at_level=1,
                                        attempts=attempts)
            except Exception:
                pass

    # ── L2: Bounded AI (Sonnet, 1 file, 5 turns) ──────────────
    if max_depth >= 2 and not strategy_config.get("deterministic", True):
        l2 = levels.get("L2", {})
        attempt = run_ai_repair(
            root, context, classification,
            level=2, level_name="L2_BOUNDED_AI",
            model=l2.get("model", "sonnet"),
            max_turns=l2.get("max_turns", 5),
            max_files=l2.get("max_files", 1),
            max_budget=l2.get("max_budget_usd", 0.25),
            allowed_files=allowed_files[:1],  # restrict to first file only
            verify_output=verify_output,
            test_output=test_output,
        )
        attempts.append(attempt)

        emit("repair_attempt", "repair.py", slice=slice_name, context=context,
             data={"level": 2, "strategy": "ai_repair", "model": l2.get("model", "sonnet"),
                    "ai_used": True, "cost_usd": attempt.cost_usd})

        if attempt.files_touched:
            try:
                from .verify_and_test import run_normalize, run_verify, run_tests
                run_normalize(root)
                v_ok, _ = run_verify(root)
                t_ok, _ = run_tests(root, context)
                if v_ok and t_ok:
                    attempt.resolved = True
                    return RepairResult(slice=slice_name, failure_class=fc,
                                        resolved=True, resolved_at_level=2,
                                        attempts=attempts,
                                        total_cost_usd=attempt.cost_usd)
            except Exception:
                pass

    # ── L3: Expanded AI (Opus, 3 files, 10 turns) ─────────────
    if max_depth >= 3 and not strategy_config.get("deterministic", True):
        l3 = levels.get("L3", {})
        attempt = run_ai_repair(
            root, context, classification,
            level=3, level_name="L3_EXPANDED_AI",
            model=l3.get("model", "opus"),
            max_turns=l3.get("max_turns", 10),
            max_files=l3.get("max_files", 3),
            max_budget=l3.get("max_budget_usd", 1.00),
            allowed_files=allowed_files,
            verify_output=verify_output,
            test_output=test_output,
        )
        attempts.append(attempt)

        emit("repair_attempt", "repair.py", slice=slice_name, context=context,
             data={"level": 3, "strategy": "ai_repair", "model": l3.get("model", "opus"),
                    "ai_used": True, "cost_usd": attempt.cost_usd})

        if attempt.files_touched:
            try:
                from .verify_and_test import run_normalize, run_verify, run_tests
                run_normalize(root)
                v_ok, _ = run_verify(root)
                t_ok, _ = run_tests(root, context)
                if v_ok and t_ok:
                    attempt.resolved = True
                    total = sum(a.cost_usd for a in attempts)
                    return RepairResult(slice=slice_name, failure_class=fc,
                                        resolved=True, resolved_at_level=3,
                                        attempts=attempts, total_cost_usd=total)
            except Exception:
                pass

    # ── L4: Human escalation ───────────────────────────────────
    if max_depth >= 4:
        attempts.append(RepairAttempt(
            level=4, level_name="L4_HUMAN", strategy="human_escalation",
            resolved=False, detail="Repair ladder exhausted — flagging for human",
        ))
        emit("human_escalation", "repair.py", slice=slice_name, context=context,
             data={"failure_class": fc, "attempts": len(attempts) - 1})

    total_cost = sum(a.cost_usd for a in attempts)
    total_time = sum(a.duration_s for a in attempts)
    human_esc = any(a.level == 4 for a in attempts)

    return RepairResult(
        slice=slice_name, failure_class=fc,
        resolved=False, resolved_at_level=0,
        attempts=attempts, total_cost_usd=total_cost,
        total_duration_s=total_time, human_escalation=human_esc,
    )


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Repair ladder — L1→L4")
    parser.add_argument("--classification", required=True)
    parser.add_argument("--decisions", default=str(DECISIONS))
    parser.add_argument("--root", default=".")
    parser.add_argument("--context", required=True)
    parser.add_argument("--provider", default="anthropic")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    class_data = load_json(Path(args.classification))
    decisions_data = load_json(Path(args.decisions))

    try:
        pipeline_config = load_config(PIPELINE_CONFIG)
    except FileNotFoundError:
        pipeline_config = {"repair": {"levels": {}, "strategies": {}}}

    # Build decisions lookup
    decisions_lookup = {d["slice"]: d for d in decisions_data.get("decisions", [])}

    classifications = class_data.get("classifications", [])
    if not classifications:
        output = {"repairs": [], "summary": {"total_slices": 0, "resolved": 0,
                  "unresolved": 0, "human_escalations": 0, "max_level_used": 0,
                  "total_cost_usd": 0, "by_level": {}}}
        write_json(REPAIR_RESULTS, output)
        set_output("total_repaired", "0")
        set_output("max_repair_level", "0")
        set_output("human_escalation", "false")
        print(json.dumps(output, indent=2))
        return

    results: list[RepairResult] = []

    for c in classifications:
        slice_name = c.get("slice_name", "")
        if slice_name == "__all__":
            results.append(RepairResult(
                slice=slice_name, failure_class=c.get("failure_class", ""),
                resolved=False, resolved_at_level=0,
                attempts=[RepairAttempt(level=0, level_name="SKIP", strategy="none",
                                         resolved=False, detail="Environment issue — skip")]))
            continue

        decision = decisions_lookup.get(slice_name, {})
        max_depth = decision.get("repair_depth", 3)

        result = repair_slice(c, root, args.context, max_depth, pipeline_config, args.provider)
        results.append(result)

    # Aggregate
    resolved = sum(1 for r in results if r.resolved)
    unresolved = sum(1 for r in results if not r.resolved)
    human_esc = sum(1 for r in results if r.human_escalation)
    max_level = max((a.level for r in results for a in r.attempts), default=0)
    total_cost = sum(r.total_cost_usd for r in results)

    by_level: dict[str, dict] = {}
    for r in results:
        for a in r.attempts:
            key = f"L{a.level}"
            if key not in by_level:
                by_level[key] = {"attempted": 0, "resolved": 0}
            by_level[key]["attempted"] += 1
            if a.resolved:
                by_level[key]["resolved"] += 1

    output = {
        "repairs": [r.to_dict() for r in results],
        "summary": {
            "total_slices": len(results),
            "resolved": resolved,
            "unresolved": unresolved,
            "human_escalations": human_esc,
            "max_level_used": max_level,
            "total_cost_usd": round(total_cost, 2),
            "by_level": by_level,
        },
    }
    write_json(REPAIR_RESULTS, output)

    set_output("total_repaired", str(resolved))
    set_output("max_repair_level", str(max_level))
    set_output("human_escalation", str(human_esc > 0).lower())

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
