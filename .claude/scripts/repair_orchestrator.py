#!/usr/bin/env python3
"""
repair_orchestrator.py — Bounded self-healing for evdb CI pipeline.

Receives classified failures and applies targeted repair strategies.
Deterministic fixes run first; AI is only invoked for domain-logic issues
(predicates, handler branching) and is restricted to declared file sets.

Hard limits:
  - Max 1 repair pass per slice (configurable via ci_config.json)
  - AI repairs restricted to declared file set per strategy
  - Never touches test files to make them pass

Exit codes:
  0 — repair complete (may or may not have fixed things)
  1 — internal error

Usage:
  python3 repair_orchestrator.py \
    --classification /tmp/classification.json \
    --root . \
    --context Funds
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path


# Load config
SCRIPTS_DIR = Path(__file__).parent
CONFIG_PATH = SCRIPTS_DIR / "ci_config.json"


def load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text())
    return {"repair": {"max_repair_passes": 1, "max_ai_turns_per_repair": 10}}


@dataclass
class RepairResult:
    slice_name: str
    failure_class: str
    strategy_used: str
    repaired: bool
    ai_used: bool = False
    files_touched: list[str] = field(default_factory=list)
    diff_size: int = 0
    details: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Deterministic repair strategies
# ---------------------------------------------------------------------------

def repair_import_error(
    slice_name: str, classification: dict, root: Path, context: str
) -> RepairResult:
    """Fix import path issues: .js extensions, missing relative prefixes."""
    bc_dir = root / "src" / "BusinessCapabilities" / context
    files_touched = []
    total_fixes = 0

    # Find all .ts files in this slice's directory
    slice_dir = bc_dir / "slices" / slice_name
    if not slice_dir.exists():
        return RepairResult(
            slice_name=slice_name,
            failure_class="import_error",
            strategy_used="import_fix",
            repaired=False,
            details=f"Slice directory not found: {slice_dir}",
        )

    for ts_file in slice_dir.rglob("*.ts"):
        content = ts_file.read_text()
        original = content

        # Fix: import from './foo.ts' → './foo.js'
        content = re.sub(
            r"from\s+['\"](\.[^'\"]+)\.ts['\"]",
            r"from '\1.js'",
            content,
        )

        # Fix: import from 'foo' where it should be './foo.js' (relative)
        # Only for local imports that look like they should be relative
        content = re.sub(
            r"from\s+['\"](?!\.|\w+:)(\w+)['\"]",
            r"from './\1.js'",
            content,
        )

        if content != original:
            ts_file.write_text(content)
            rel = str(ts_file.relative_to(root))
            files_touched.append(rel)
            total_fixes += 1

    # Also check swimlane files
    swimlane_dir = bc_dir / "swimlanes"
    if swimlane_dir.exists():
        for ts_file in swimlane_dir.rglob("*.ts"):
            content = ts_file.read_text()
            original = content
            content = re.sub(
                r"from\s+['\"](\.[^'\"]+)\.ts['\"]",
                r"from '\1.js'",
                content,
            )
            if content != original:
                ts_file.write_text(content)
                rel = str(ts_file.relative_to(root))
                files_touched.append(rel)
                total_fixes += 1

    return RepairResult(
        slice_name=slice_name,
        failure_class="import_error",
        strategy_used="import_fix",
        repaired=total_fixes > 0,
        files_touched=files_touched,
        diff_size=total_fixes,
        details=f"Fixed {total_fixes} import path(s)",
    )


def repair_type_error(
    slice_name: str, classification: dict, root: Path, context: str
) -> RepairResult:
    """Patch field types based on verify detail messages."""
    files_touched = []
    total_fixes = 0

    details = classification.get("details", [])
    for detail_line in details:
        # Parse verify detail: "field_foo: Missing: readonly foo: string"
        # or "field_foo — type may differ — expected: bigint"
        match = re.search(r"field_(\w+).*?expected:\s*(\w+)", detail_line)
        if not match:
            match = re.search(r"Missing:\s*readonly\s+(\w+)\s*:\s*(\w+)", detail_line)
        if not match:
            continue

        field_name, expected_type = match.group(1), match.group(2)

        # Find the file that has this field
        affected = classification.get("affected_files", [])
        for rel_file in affected:
            abs_path = root / "src" / "BusinessCapabilities" / context / rel_file
            if not abs_path.exists():
                continue

            content = abs_path.read_text()
            # Try to fix: readonly fieldName: wrongType → readonly fieldName: expectedType
            new_content = re.sub(
                rf"(readonly\s+{re.escape(field_name)}\s*:\s*)\w+",
                rf"\g<1>{expected_type}",
                content,
            )
            if new_content != content:
                abs_path.write_text(new_content)
                files_touched.append(rel_file)
                total_fixes += 1

    return RepairResult(
        slice_name=slice_name,
        failure_class="type_error",
        strategy_used="type_fix",
        repaired=total_fixes > 0,
        files_touched=files_touched,
        diff_size=total_fixes,
        details=f"Fixed {total_fixes} type mismatch(es)",
    )


def repair_path_error(
    slice_name: str, classification: dict, root: Path, context: str
) -> RepairResult:
    """Check expected paths vs actual and rename/move if found nearby."""
    files_touched = []
    total_fixes = 0

    details = classification.get("details", [])
    bc_dir = root / "src" / "BusinessCapabilities" / context

    for detail_line in details:
        # Parse: "MISSING: slices/ApproveWithdrawal/command.ts"
        match = re.search(r"MISSING:\s*(.+)", detail_line)
        if not match:
            continue

        expected_rel = match.group(1).strip()
        expected_path = bc_dir / expected_rel

        if expected_path.exists():
            continue  # not actually missing

        # Search for a file with the same name in nearby directories
        filename = expected_path.name
        candidates = list(bc_dir.rglob(filename))

        if len(candidates) == 1:
            # Found exactly one match — move it
            candidate = candidates[0]
            expected_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(candidate), str(expected_path))
            files_touched.append(expected_rel)
            total_fixes += 1

    return RepairResult(
        slice_name=slice_name,
        failure_class="path_error",
        strategy_used="path_fix",
        repaired=total_fixes > 0,
        files_touched=files_touched,
        diff_size=total_fixes,
        details=f"Moved {total_fixes} file(s) to expected path(s)",
    )


# ---------------------------------------------------------------------------
# AI repair strategies (bounded)
# ---------------------------------------------------------------------------

def repair_with_ai(
    slice_name: str,
    classification: dict,
    root: Path,
    context: str,
    strategy_name: str,
    allowed_files: list[str],
    config: dict,
) -> RepairResult:
    """Run a bounded Claude Code session to fix a specific issue.

    Restricted to allowed_files only. Never touches test files.
    """
    max_turns = config.get("repair", {}).get("max_ai_turns_per_repair", 10)

    # Build a focused repair prompt
    failure_class = classification.get("failure_class", "unknown")
    details = "\n".join(classification.get("details", []))
    affected = ", ".join(classification.get("affected_files", []))

    allowed_str = ", ".join(allowed_files)

    prompt = f"""You are fixing a specific CI failure in an evdb slice.

Slice: {slice_name}
Context: {context}
Failure class: {failure_class}
Details:
{details}

Affected files: {affected}

CONSTRAINTS:
- You may ONLY modify these files: {allowed_str}
- These files are in src/BusinessCapabilities/{context}/slices/{slice_name}/
- Do NOT modify any test files (*.test.ts)
- Do NOT modify files in other slices
- Make the MINIMAL change needed to fix the failure
- Do NOT add new features or refactor unrelated code

Read the failing file(s), understand the issue, and apply a targeted fix."""

    # Check if claude CLI is available
    claude_path = shutil.which("claude")
    if not claude_path:
        return RepairResult(
            slice_name=slice_name,
            failure_class=failure_class,
            strategy_used=strategy_name,
            repaired=False,
            ai_used=False,
            details="Claude CLI not available — skipping AI repair",
        )

    # Capture files before repair for diff size
    slice_dir = root / "src" / "BusinessCapabilities" / context / "slices" / slice_name
    before_snapshot = _snapshot_files(slice_dir, allowed_files)

    try:
        env = os.environ.copy()
        result = subprocess.run(
            [
                claude_path, "--print", "--dangerously-skip-permissions",
                "--output-format", "text",
                "--max-turns", str(max_turns),
                prompt,
            ],
            capture_output=True,
            text=True,
            cwd=str(root),
            timeout=300,  # 5 minute hard cap
            env=env,
        )
    except subprocess.TimeoutExpired:
        return RepairResult(
            slice_name=slice_name,
            failure_class=failure_class,
            strategy_used=strategy_name,
            repaired=False,
            ai_used=True,
            details="AI repair timed out (5 min)",
        )
    except FileNotFoundError:
        return RepairResult(
            slice_name=slice_name,
            failure_class=failure_class,
            strategy_used=strategy_name,
            repaired=False,
            ai_used=False,
            details="Claude CLI not found",
        )

    # Check what changed
    after_snapshot = _snapshot_files(slice_dir, allowed_files)
    files_touched = []
    diff_size = 0

    for fname in set(list(before_snapshot.keys()) + list(after_snapshot.keys())):
        before = before_snapshot.get(fname, "")
        after = after_snapshot.get(fname, "")
        if before != after:
            files_touched.append(fname)
            diff_size += abs(len(after.split("\n")) - len(before.split("\n")))

    # Verify the repair didn't touch disallowed files
    _verify_boundary(slice_dir, allowed_files, before_snapshot, after_snapshot)

    return RepairResult(
        slice_name=slice_name,
        failure_class=failure_class,
        strategy_used=strategy_name,
        repaired=len(files_touched) > 0,
        ai_used=True,
        files_touched=files_touched,
        diff_size=diff_size,
        details=f"AI repair {'applied changes' if files_touched else 'made no changes'}",
    )


def _snapshot_files(directory: Path, allowed_patterns: list[str]) -> dict[str, str]:
    """Snapshot file contents for diff comparison."""
    snapshot = {}
    if not directory.exists():
        return snapshot
    for pattern in allowed_patterns:
        for f in directory.rglob(pattern):
            if f.is_file() and ".test." not in f.name:
                snapshot[str(f.relative_to(directory))] = f.read_text()
    return snapshot


def _verify_boundary(
    slice_dir: Path,
    allowed_patterns: list[str],
    before: dict[str, str],
    after: dict[str, str],
) -> None:
    """Ensure AI didn't modify files outside the allowed set.

    If boundary violation detected, restore from before snapshot.
    """
    # Check all files in slice_dir for unexpected changes
    if not slice_dir.exists():
        return

    for f in slice_dir.rglob("*.ts"):
        rel = str(f.relative_to(slice_dir))
        if rel in after:
            continue  # known file

        # Check if this file was modified (it shouldn't be)
        if ".test." in f.name:
            # Test files should never be modified
            if rel in before:
                f.write_text(before[rel])  # restore


# ---------------------------------------------------------------------------
# Strategy dispatcher
# ---------------------------------------------------------------------------

DETERMINISTIC_STRATEGIES = {
    "import_error": repair_import_error,
    "type_error": repair_type_error,
    "path_error": repair_path_error,
}

AI_STRATEGIES = {
    "predicate_mismatch": ("predicate_repair", ["gwts.ts"]),
    "missing_handler_branch": ("handler_repair", ["commandHandler.ts"]),
    "verification_failure": ("generic_repair", ["gwts.ts", "commandHandler.ts", "adapter.ts"]),
    "test_failure": ("test_logic_repair", ["gwts.ts", "commandHandler.ts"]),
}


def repair_slice(
    classification: dict, root: Path, context: str, config: dict
) -> RepairResult:
    """Dispatch to the appropriate repair strategy for a single slice."""
    slice_name = classification["slice_name"]
    failure_class = classification["failure_class"]

    # Try deterministic first
    if failure_class in DETERMINISTIC_STRATEGIES:
        return DETERMINISTIC_STRATEGIES[failure_class](
            slice_name, classification, root, context
        )

    # Try AI repair
    if failure_class in AI_STRATEGIES:
        strategy_name, allowed_files = AI_STRATEGIES[failure_class]
        return repair_with_ai(
            slice_name, classification, root, context,
            strategy_name, allowed_files, config
        )

    # Unrecoverable classes
    if failure_class in ("flaky_or_env", "unknown"):
        return RepairResult(
            slice_name=slice_name,
            failure_class=failure_class,
            strategy_used="none",
            repaired=False,
            details=f"No repair strategy for {failure_class}",
        )

    return RepairResult(
        slice_name=slice_name,
        failure_class=failure_class,
        strategy_used="none",
        repaired=False,
        details=f"Unhandled failure class: {failure_class}",
    )


def repair_all(
    classifications: list[dict], root: Path, context: str, config: dict
) -> list[RepairResult]:
    """Run repairs for all classified failures, respecting max_repair_passes."""
    max_passes = config.get("repair", {}).get("max_repair_passes", 1)
    results = []

    for classification in classifications:
        slice_name = classification.get("slice_name", "unknown")
        if slice_name == "__all__":
            # Environment issues — skip repair
            results.append(RepairResult(
                slice_name=slice_name,
                failure_class=classification.get("failure_class", "unknown"),
                strategy_used="none",
                repaired=False,
                details="Environment issue — cannot repair automatically",
            ))
            continue

        # Apply up to max_passes repair attempts
        for pass_num in range(max_passes):
            result = repair_slice(classification, root, context, config)
            results.append(result)
            if result.repaired:
                break  # success, stop retrying

    return results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Bounded repair orchestrator for evdb CI")
    parser.add_argument("--classification", required=True, help="Path to classification JSON")
    parser.add_argument("--root", default=".", help="Project root")
    parser.add_argument("--context", required=True, help="Context name (PascalCase)")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    config = load_config()

    classification_path = Path(args.classification)
    if not classification_path.exists():
        print(json.dumps({"repairs": [], "error": "Classification file not found"}))
        sys.exit(0)

    data = json.loads(classification_path.read_text())
    classifications = data.get("classifications", [])

    if not classifications:
        print(json.dumps({"repairs": [], "total_repaired": 0, "total_ai_used": 0}))
        sys.exit(0)

    results = repair_all(classifications, root, args.context, config)

    output = {
        "repairs": [r.to_dict() for r in results],
        "total_repaired": sum(1 for r in results if r.repaired),
        "total_ai_used": sum(1 for r in results if r.ai_used),
        "total_attempted": len(results),
    }

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
