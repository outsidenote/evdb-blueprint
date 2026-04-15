#!/usr/bin/env python3
"""Stage: Extract structured memory records from successful AI implementations.

Runs after verify+test passes. Parses gwts.ts, commandHandler.ts, and
projection index.ts to extract reusable domain patterns as structured
memory records. Writes to /tmp/learned-discoveries.json as an artifact.

Patterns stay structured end-to-end — no markdown conversion.
Deduplication uses a stable content fingerprint (SHA-256 of canonical fields).
IDs are deterministic (type:context:slice:key) so the same pattern across
runs produces the same record identity — making merges and updates trivial.

Only fires on success — failed runs don't teach good patterns.

Usage:
    python3 .ci/stages/learn.py \
        --root . \
        --context Portfolio \
        --slices "addloantoportfolio,assessloanrisk" \
        --verify-passed true \
        --test-passed true
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.audit import emit
from lib.contracts import load_json, write_json

# ── Constants ───────────────────────────────────────────────────

DISCOVERIES_PATH = Path("/tmp/learned-discoveries.json")
NOW_ISO = datetime.now(timezone.utc).isoformat()
SOURCE_STAGE = "learn.py"
MEMORY_VERSION = 1


# ── Fingerprinting ──────────────────────────────────────────────

def pattern_fingerprint(pattern_type: str, canonical_key: str, canonical_value: str) -> str:
    """Produce a stable SHA-256 fingerprint from the pattern's content fields.

    The fingerprint is content-addressed: same type + key + normalized value
    always yields the same hash, regardless of slice, context, timestamp, or run.
    This is the *content identity* — two patterns with different business meaning
    but identical logic text will share a fingerprint.

    For scoped deduplication (respecting context boundaries), use the
    deterministic `id` field instead, which encodes type:context:slice:key.

    Args:
        pattern_type:    One of "predicate", "computed_field", "projection_sql".
        canonical_key:   The identity of the pattern (predicate name, field name,
                         or slice name for projections).
        canonical_value: The normalized content (condition text, expression text,
                         or sql excerpt).
    """
    normalized = re.sub(r"\s+", " ", canonical_value.strip())
    payload = f"{pattern_type}:{canonical_key}:{normalized}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def deterministic_id(pattern_type: str, context: str, slice_name: str, canonical_key: str) -> str:
    """Build a human-readable, deterministic ID for scoped identity.

    This is the *local memory identity* — two patterns with identical logic
    but from different slices or contexts get different IDs.
    """
    return f"{pattern_type}:{context}:{slice_name}:{canonical_key}"


# ── Scope classification ────────────────────────────────────────

def classify_scope(pattern_type: str, content_value: str) -> dict:
    """Determine whether a pattern is global, context-scoped, or slice-local.

    Heuristics (grounded in real codebase patterns):
    - projection_sql → always slice-local (SQL references projection-specific tables/keys)
    - references `command.` → slice-local (tied to a specific command type)
    - only references state/balance fields → context-scoped (reusable across slices)
    """
    if pattern_type == "projection_sql":
        return {"level": "slice_local", "value": ""}
    if "command." in content_value:
        return {"level": "slice_local", "value": ""}
    return {"level": "context", "value": ""}


# ── Quality scoring ─────────────────────────────────────────────

def compute_quality_score(
    verify_passed: bool,
    test_passed: bool,
    pattern_type: str = "",
    content_value: str = "",
) -> float:
    """Quality score based on pipeline signals + content complexity.

    Base (0.8 max):  +0.4 verify pass, +0.4 test pass.
    Complexity (0.2 max): signals that the pattern has non-trivial logic.
    Capped at 1.0. Later enriched by reuse success.
    """
    score = 0.0
    if verify_passed:
        score += 0.4
    if test_passed:
        score += 0.4

    # Complexity signals — patterns with richer logic score higher
    if pattern_type == "predicate":
        if "&&" in content_value or "||" in content_value:
            score += 0.1  # compound condition
        if "+" in content_value or "*" in content_value:
            score += 0.1  # arithmetic in predicate
    elif pattern_type == "computed_field":
        ops = content_value.count("+") + content_value.count("*") + content_value.count("?")
        if ops > 1:
            score += 0.1  # multi-operation expression
        if "`" in content_value:
            score += 0.1  # template literal (string construction)
    elif pattern_type == "projection_sql":
        upper = content_value.upper()
        if "COALESCE" in upper or "jsonb_build_object" in content_value:
            score += 0.15  # non-trivial SQL
        elif content_value.strip().upper().startswith("DELETE"):
            score += 0.1  # cleanup logic

    return min(score, 1.0)


# ── Dynamic tag derivation ──────────────────────────────────────

def derive_content_tags(pattern_type: str, content_value: str) -> list[str]:
    """Derive additional tags from content analysis.

    These supplement the static type-based tags with signals about
    what kind of logic the pattern contains — useful for retrieval
    filtering and for understanding pattern diversity.
    """
    extra: list[str] = []

    if pattern_type == "predicate":
        if "&&" in content_value or "||" in content_value:
            extra.append("compound-condition")
        if ">" in content_value or "<" in content_value:
            extra.append("comparison")
        if "+" in content_value or "*" in content_value:
            extra.append("arithmetic")

    elif pattern_type == "computed_field":
        if "`" in content_value:
            extra.append("template-literal")
        if "?" in content_value:
            extra.append("conditional")
        if "+" in content_value or "*" in content_value:
            extra.append("arithmetic")

    elif pattern_type == "projection_sql":
        upper = content_value.upper()
        if upper.strip().startswith("DELETE"):
            extra.append("delete-pattern")
        if "COALESCE" in upper:
            extra.append("null-handling")
        if "jsonb_build_object" in content_value:
            extra.append("jsonb-construction")

    return extra


# ── Memory record builder ──────────────────────────────────────

def to_memory_record(
    pattern: dict,
    *,
    context: str,
    verify_passed: bool,
    test_passed: bool,
) -> dict:
    """Convert an extracted pattern dict into a structured memory record.

    The record is self-contained and carries enough metadata for:
    - deduplication: fingerprint (content identity) + id (scoped identity)
    - filtered retrieval: type, tags, context, slice, file, scope
    - lifecycle tracking: status, quality_score, times_reused, last_reused_at
    - provenance: source_stage, source_run_id, verify_passed, test_passed
    - schema evolution: memory_version
    """
    ptype = pattern["type"]
    slice_name = pattern.get("slice", "")
    file_name = pattern.get("file", "")
    run_id = os.environ.get("GITHUB_RUN_ID", "local")

    # Build the content block — normalized to name + logic where applicable
    if ptype == "predicate":
        canonical_key = pattern["name"]
        canonical_value = pattern["condition"]
        content = {
            "name": pattern["name"],
            "logic": pattern["condition"],
        }
        tags = ["predicate", "gwts", "business-rule"]

    elif ptype == "computed_field":
        canonical_key = pattern["field"]
        canonical_value = pattern["expression"]
        content = {
            "name": pattern["field"],
            "logic": pattern["expression"],
        }
        tags = ["computed-field", "command-handler", "derivation"]

    elif ptype == "projection_sql":
        canonical_key = slice_name
        canonical_value = pattern["sql_excerpt"]
        content = {
            "sql_excerpt": pattern["sql_excerpt"],
        }
        tags = ["projection", "sql", "upsert"]

    else:
        canonical_key = ptype
        canonical_value = json.dumps(pattern, sort_keys=True)
        content = {"raw": pattern}
        tags = [ptype]

    # Enrich tags from content analysis
    tags.extend(derive_content_tags(ptype, canonical_value))

    fingerprint = pattern_fingerprint(ptype, canonical_key, canonical_value)
    record_id = deterministic_id(ptype, context, slice_name, canonical_key)
    scope = classify_scope(ptype, canonical_value)
    scope["value"] = context

    return {
        "memory_version": MEMORY_VERSION,
        "id": record_id,
        "fingerprint": fingerprint,
        "type": ptype,
        "context": context,
        "slice": slice_name,
        "file": file_name,
        "scope": scope,
        "created_at": NOW_ISO,
        "status": "candidate",
        "quality_score": compute_quality_score(
            verify_passed, test_passed, ptype, canonical_value,
        ),
        "tags": tags,
        "content": content,
        # Provenance
        "source_stage": SOURCE_STAGE,
        "source_run_id": run_id,
        "verify_passed": verify_passed,
        "test_passed": test_passed,
        # Lifecycle — updated by retrieve/promote workflows
        "times_reused": 0,
        "last_reused_at": None,
    }


# ── Pattern extractors ─────────────────────────────────────────

def extract_predicate_patterns(gwts_path: Path, slice_name: str) -> list[dict]:
    """Extract predicate logic from a filled gwts.ts file.

    Looks for exported arrow-function predicates that return boolean expressions.
    Skips TODO placeholders and trivial true/false returns.
    """
    if not gwts_path.exists():
        return []

    content = gwts_path.read_text()
    patterns: list[dict] = []

    pred_re = re.compile(
        r"export\s+const\s+(\w+)\s*=\s*\([^)]*\)(?:\s*:\s*boolean)?\s*=>\s*\n?\s*(.+?)(?:;|\n)",
        re.MULTILINE,
    )
    for match in pred_re.finditer(content):
        name = match.group(1)
        condition = match.group(2).strip().rstrip(";")

        if "TODO" in condition or condition in ("false", "true"):
            continue

        patterns.append({
            "type": "predicate",
            "name": name,
            "condition": condition,
            "slice": slice_name,
            "file": "gwts.ts",
        })

    return patterns


def extract_handler_patterns(handler_path: Path, slice_name: str) -> list[dict]:
    """Extract computed field derivations from commandHandler.ts.

    Captures fields whose values involve computation (arithmetic, ternary,
    template literals) rather than simple command forwarding.
    """
    if not handler_path.exists():
        return []

    content = handler_path.read_text()
    patterns: list[dict] = []

    computed_re = re.compile(
        r"(\w+):\s*(.+?(?:\*|/|\+|-|`|\?).+?)(?:,|\n)",
    )
    for match in computed_re.finditer(content):
        field_name = match.group(1).strip()
        expression = match.group(2).strip().rstrip(",")

        if re.match(r"^command\.\w+$", expression):
            continue
        # Skip negated/wrapped single-field forwards: -command.x, Number(command.x)
        if re.match(r"^-?\(?command\.\w+\)?$", expression):
            continue
        if re.match(r"^\w+\(command\.\w+\)$", expression):
            continue
        if "TODO" in expression:
            continue
        # Skip JSDoc/comment lines that leak through the regex
        if expression.startswith("*") or expression.startswith("//"):
            continue

        patterns.append({
            "type": "computed_field",
            "field": field_name,
            "expression": expression,
            "slice": slice_name,
            "file": "commandHandler.ts",
        })

    return patterns


def extract_projection_patterns(index_path: Path, slice_name: str) -> list[dict]:
    """Extract SQL patterns from projection index.ts.

    Only captures SQL that was customized beyond the scaffold's generic UPSERT.
    Detects: field-specific access, complex JSON ops, positional params, DELETE.
    Filters: generic EXCLUDED.payload passthrough (scaffold default).
    """
    if not index_path.exists():
        return []

    content = index_path.read_text()

    # Still using the scaffold's generic JSON dump — nothing learned
    if "JSON.stringify(p)" in content:
        return []

    patterns: list[dict] = []
    sql_re = re.compile(r"sql:\s*`([^`]+)`", re.DOTALL)

    for match in sql_re.finditer(content):
        sql = match.group(1).strip()

        # Skip generic "overwrite entire payload" upsert (scaffold default)
        if "EXCLUDED.payload" in sql and "jsonb" not in sql.lower():
            continue

        has_field_access = "payload->" in sql or "payload ->" in sql
        has_positional   = "$4" in sql or "$5" in sql or "$6" in sql
        has_jsonb_ops    = "jsonb_build_object" in sql or "jsonb_set" in sql
        has_coalesce     = "COALESCE" in sql.upper()
        is_delete        = sql.strip().upper().startswith("DELETE")

        if has_field_access or has_positional or has_jsonb_ops or has_coalesce or is_delete:
            patterns.append({
                "type": "projection_sql",
                "sql_excerpt": sql[:300],
                "slice": slice_name,
                "file": "index.ts",
            })

    return patterns


# ── Deduplication ───────────────────────────────────────────────

def deduplicate(
    records: list[dict],
    existing_ids: set[str],
    existing_fingerprints: set[str] | None = None,
) -> tuple[list[dict], int]:
    """Remove duplicate records using two layers.

    Layer 1 — scoped ID (type:context:slice:key):
        Exact same record from prior runs → skip.

    Layer 2 — content fingerprint (SHA-256 of type:key:logic):
        Same logic appearing in multiple slices → keep the first,
        promote its scope to "context" (it's a reusable pattern).

    Returns (unique_records, duplicates_skipped).
    """
    seen_ids = set(existing_ids)
    seen_fps = set(existing_fingerprints or set())
    # Index for fast fingerprint→record lookup within this batch
    fp_index: dict[str, dict] = {}
    unique: list[dict] = []
    skipped = 0

    for record in records:
        rid = record["id"]
        fp = record["fingerprint"]

        # Layer 1: exact scoped ID match → skip
        if rid in seen_ids:
            skipped += 1
            continue

        # Layer 2: content-identical record already seen → skip,
        # but widen the earlier record's scope since the pattern
        # proved reusable across slices
        if fp in seen_fps:
            earlier = fp_index.get(fp)
            if earlier and earlier["scope"]["level"] == "slice_local":
                earlier["scope"]["level"] = "context"
            skipped += 1
            continue

        seen_ids.add(rid)
        seen_fps.add(fp)
        fp_index[fp] = record
        unique.append(record)

    return unique, skipped


def load_existing_ids(path: Path) -> set[str]:
    """Load IDs from a prior discovery artifact for cross-run dedup."""
    data = load_json(path)
    if not data or "records" not in data:
        return set()
    return {r["id"] for r in data["records"] if "id" in r}


def load_existing_fingerprints(path: Path) -> set[str]:
    """Load fingerprints from a prior discovery artifact for content dedup."""
    data = load_json(path)
    if not data or "records" not in data:
        return set()
    return {r["fingerprint"] for r in data["records"] if "fingerprint" in r}


# ── Main ────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract structured memory records from successful runs",
    )
    parser.add_argument("--root", default=".")
    parser.add_argument("--context", required=True)
    parser.add_argument("--slices", required=True)
    parser.add_argument("--verify-passed", default="true")
    parser.add_argument("--test-passed", default="true")
    parser.add_argument("--prior-discoveries", default="")
    args = parser.parse_args()

    verify_passed = args.verify_passed.lower() == "true"
    test_passed = args.test_passed.lower() == "true"

    # Only learn from successful runs
    if not verify_passed or not test_passed:
        print("SKIP: only learn from fully passing runs", file=sys.stderr)
        return

    root = Path(args.root).resolve()
    context = args.context
    slice_names = [s.strip() for s in args.slices.split(",") if s.strip()]

    # ── Extract raw patterns from each slice ────────────────
    all_patterns: list[dict] = []

    for slice_name in slice_names:
        slice_parent = root / "src" / "BusinessCapabilities" / context / "slices"
        slice_dir: Path | None = None

        if slice_parent.exists():
            for d in slice_parent.iterdir():
                if d.is_dir() and d.name.lower() == slice_name.lower():
                    slice_dir = d
                    break

        if not slice_dir:
            continue

        gwts = slice_dir / "gwts.ts"
        handler = slice_dir / "commandHandler.ts"
        projection = slice_dir / "index.ts"

        all_patterns.extend(extract_predicate_patterns(gwts, slice_name))
        all_patterns.extend(extract_handler_patterns(handler, slice_name))
        all_patterns.extend(extract_projection_patterns(projection, slice_name))

    if not all_patterns:
        print("No patterns discovered", file=sys.stderr)
        return

    # ── Convert to memory records ───────────────────────────
    records = [
        to_memory_record(
            p,
            context=context,
            verify_passed=verify_passed,
            test_passed=test_passed,
        )
        for p in all_patterns
    ]

    # ── Deduplicate (Layer 1: scoped ID, Layer 2: content fingerprint) ─
    prior_ids: set[str] = set()
    prior_fps: set[str] = set()
    if args.prior_discoveries:
        prior_path = Path(args.prior_discoveries)
        prior_ids = load_existing_ids(prior_path)
        prior_fps = load_existing_fingerprints(prior_path)

    unique_records, dupes_skipped = deduplicate(records, prior_ids, prior_fps)

    if not unique_records:
        print(
            f"Found {len(all_patterns)} patterns, all already known "
            f"({dupes_skipped} duplicates)",
            file=sys.stderr,
        )
        return

    # ── Write structured artifact ───────────────────────────
    artifact = {
        "memory_version": MEMORY_VERSION,
        "context": context,
        "created_at": NOW_ISO,
        "source_stage": SOURCE_STAGE,
        "source_run_id": os.environ.get("GITHUB_RUN_ID", "local"),
        "record_count": len(unique_records),
        "records": unique_records,
    }
    write_json(DISCOVERIES_PATH, artifact)

    # ── Audit ───────────────────────────────────────────────
    type_counts: dict[str, int] = {}
    for r in unique_records:
        type_counts[r["type"]] = type_counts.get(r["type"], 0) + 1

    emit(
        "patterns_learned",
        SOURCE_STAGE,
        context=context,
        data={
            "total_extracted": len(all_patterns),
            "new_records": len(unique_records),
            "duplicates_skipped": dupes_skipped,
            "by_type": type_counts,
            "ids": [r["id"] for r in unique_records],
        },
    )

    print(
        f"Learned {len(unique_records)} new record(s) from "
        f"{len(slice_names)} slice(s) ({dupes_skipped} duplicates skipped):",
        file=sys.stderr,
    )
    for r in unique_records:
        label = r["content"].get("name") or r["slice"]
        print(f"  [{r['type']}] {label} (id: {r['id']})", file=sys.stderr)


if __name__ == "__main__":
    main()
