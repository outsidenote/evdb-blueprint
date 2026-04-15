#!/usr/bin/env python3
"""Retrieve relevant structured hints for a slice implementation.

Reads memory records from a learned-discoveries JSON artifact and returns
the top-N most relevant, scored deterministically. No vector DB, no
embeddings — just additive scoring over four dimensions.

Scoring:
  +3  file match    — record.file matches a TODO file
  +2  type match    — record.type aligns with the TODO file's expected type
  +1  context match — same business capability context
  +1  recently used — record was reused in a prior run

Ties broken by quality_score DESC, then created_at DESC (most recent).

Status filtering:
  FAST mode — only "approved" records (trusted, lean prompt)
  DEEP mode — "approved" + top "candidate" records

Can be used as:
  - Importable module: implement_slice.py calls retrieve() + format_for_prompt()
  - CLI tool: for debugging retrieval outside CI

Usage:
    python3 .ci/stages/retrieve_hints.py \
        --discoveries /tmp/learned-discoveries.json \
        --context Portfolio \
        --slice assessloanrisk \
        --todo-files "gwts.ts,commandHandler.ts" \
        --max-hints 5 \
        --mode deep
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.contracts import load_json


# ── Scoring weights ─────────────────────────────────────────────
# Deterministic, additive. No ML, no embeddings.

SCORE_FILE_MATCH      = 3   # record.file is one of the TODO files
SCORE_TYPE_MATCH      = 2   # record.type aligns with the TODO file's needs
SCORE_CONTEXT_MATCH   = 1   # same business capability context
SCORE_RECENTLY_USED   = 1   # was reused at least once before (boolean, not count)

# Maps a TODO filename (lowercased) to the pattern types it needs
FILE_TO_TYPES: dict[str, list[str]] = {
    "gwts.ts":            ["predicate"],
    "commandhandler.ts":  ["computed_field"],
    "index.ts":           ["projection_sql"],
}

# Status sets for each retrieval mode
APPROVED_STATUSES  = {"approved"}
CANDIDATE_STATUSES = {"approved", "candidate"}


# ── Memory index ───────────────────────────────────────────────

class MemoryIndex:
    """Pre-indexed memory records for fast candidate narrowing.

    Built once at load time, read-only after construction (thread-safe).
    Each lookup dimension (file, type, context) maps to a set of record
    indices. Retrieval unions these sets instead of scanning the full list.

    With N records and Q query dimensions, candidate_indices is O(Q)
    instead of O(N). For 100 records and 3 TODO files, this turns
    3 × O(100) scoring loops into 3 × O(~10) lookups.
    """
    __slots__ = ("records", "by_file", "by_type", "by_context")

    def __init__(self, records: list[dict]) -> None:
        self.records = records
        self.by_file: dict[str, list[int]] = {}
        self.by_type: dict[str, list[int]] = {}
        self.by_context: dict[str, list[int]] = {}

        for i, r in enumerate(records):
            f = r.get("file", "").lower()
            if f:
                self.by_file.setdefault(f, []).append(i)

            t = r.get("type", "")
            if t:
                self.by_type.setdefault(t, []).append(i)

            c = r.get("context", "").lower()
            if c:
                self.by_context.setdefault(c, []).append(i)

    def candidates(
        self,
        todo_files_lower: set[str],
        needed_types: set[str],
        context: str,
    ) -> list[dict]:
        """Return records matching at least one lookup dimension.

        Union of file, type, and context matches. Records matching
        no dimension would score 0 anyway — skip them early.
        """
        hits: set[int] = set()
        for f in todo_files_lower:
            hits.update(self.by_file.get(f, ()))
        for t in needed_types:
            hits.update(self.by_type.get(t, ()))
        hits.update(self.by_context.get(context.lower(), ()))
        return [self.records[i] for i in hits]


def build_memory_index(records: list[dict]) -> MemoryIndex:
    """Build a pre-indexed memory structure from raw records.

    Call once at load time in main(), pass the index to all workers.
    The index holds a reference to the original list — no copies.
    """
    return MemoryIndex(records)


# ── Scoring ─────────────────────────────────────────────────────

def score_record(
    record: dict,
    *,
    context: str,
    todo_files_lower: set[str],
    needed_types: set[str],
) -> float:
    """Score a single memory record. Higher = more relevant."""
    score = 0.0

    # +3 file match
    if record.get("file", "").lower() in todo_files_lower:
        score += SCORE_FILE_MATCH

    # +2 type match
    if record.get("type") in needed_types:
        score += SCORE_TYPE_MATCH

    # +1 context match
    if record.get("context", "").lower() == context.lower():
        score += SCORE_CONTEXT_MATCH

    # +1 recently used (boolean: was it ever reused?)
    if record.get("times_reused", 0) > 0 or record.get("last_reused_at"):
        score += SCORE_RECENTLY_USED

    return score


def _derive_needed_types(todo_files_lower: set[str]) -> set[str]:
    """From TODO filenames, derive which pattern types are useful."""
    needed: set[str] = set()
    for fname in todo_files_lower:
        for key, types in FILE_TO_TYPES.items():
            if key in fname:
                needed.update(types)
    return needed


# ── Retrieval ───────────────────────────────────────────────────

def retrieve(
    *,
    discoveries_path: Path | None = None,
    records: list[dict] | None = None,
    index: MemoryIndex | None = None,
    context: str,
    slice_name: str,
    todo_files: list[str],
    max_hints: int = 5,
    mode: str = "deep",
) -> list[dict]:
    """Retrieve top-N relevant memory records for a slice.

    Three source modes (checked in order):
      1. index  — pre-built MemoryIndex, narrows candidates via lookup (fast)
      2. records — raw list, scans everything (fallback)
      3. discoveries_path — loads from disk, then scans (CLI mode)

    Returns records sorted by score DESC → quality DESC → created_at DESC.
    """
    # ── Resolve candidates ──────────────────────────────────
    allowed = APPROVED_STATUSES if mode == "fast" else CANDIDATE_STATUSES
    todo_files_lower = {f.lower() for f in todo_files}
    needed_types = _derive_needed_types(todo_files_lower)

    if index is not None:
        # Fast path: pre-indexed candidates, no full scan
        candidates = index.candidates(todo_files_lower, needed_types, context)
    else:
        # Fallback: load records if needed, scan all
        if records is None:
            if discoveries_path and discoveries_path.exists():
                data = load_json(discoveries_path)
                if isinstance(data, dict):
                    records = data.get("records") or data.get("patterns") or []
                else:
                    records = []
            else:
                return []
        candidates = records or []

    if not candidates:
        return []

    # ── Score + rank ────────────────────────────────────────
    scored: list[tuple[float, float, str, dict]] = []
    for record in candidates:
        status = record.get("status", "candidate")
        if status in ("rejected", "deprecated"):
            continue
        if status not in allowed:
            continue

        s = score_record(
            record,
            context=context,
            todo_files_lower=todo_files_lower,
            needed_types=needed_types,
        )
        if s <= 0:
            continue

        quality = record.get("quality_score", 0.0)
        created = record.get("created_at", "")
        scored.append((s, quality, created, record))

    # Sort: highest score → highest quality → most recent
    scored.sort(key=lambda x: (x[0], x[1], x[2]), reverse=True)

    return [item[3] for item in scored[:max_hints]]


# ── Prompt formatting ───────────────────────────────────────────

def format_for_prompt(records: list[dict]) -> str:
    """Format retrieved records into bullet lines for prompt injection.

    Output shape (ready to embed under a ## Relevant Hints header):
        - Predicate `isOverdue`: `state.dueDate < Date.now()` (from: manageLoan)
        - Computed field `balance` = `amount - repaid` (from: trackPayments)

    Uses normalized content fields: name + logic for predicates/computed,
    sql_excerpt for projections.
    """
    if not records:
        return ""

    lines: list[str] = []
    for r in records:
        content = r.get("content", {})
        ptype = r.get("type", "")
        src = r.get("slice", "")

        if ptype == "predicate":
            name = content.get("name", "?")
            logic = content.get("logic", "?")
            lines.append(f"- Predicate `{name}`: `{logic}` (from: {src})")

        elif ptype == "computed_field":
            name = content.get("name", "?")
            logic = content.get("logic", "?")
            lines.append(f"- Computed field `{name}` = `{logic}` (from: {src})")

        elif ptype == "projection_sql":
            sql = content.get("sql_excerpt", "?")
            if len(sql) > 120:
                sql = sql[:117] + "..."
            lines.append(f"- Projection SQL: `{sql}` (from: {src})")

        else:
            lines.append(f"- [{ptype}] {json.dumps(content)} (from: {src})")

    return "\n".join(lines)


# ── Future: vector DB plug-in point ─────────────────────────────
# To upgrade to Chroma / LanceDB:
#   1. Replace the score_record() loop with a similarity search
#   2. Use content.logic / content.sql_excerpt as the embedding text
#   3. Keep the same metadata filters (type, context, status, file)
#   4. Keep format_for_prompt() unchanged — it formats whatever comes back
#   5. Add a --backend flag: "local" (current) vs "chroma" vs "lancedb"
# The retrieve() signature stays the same — callers don't change.


# ── CLI ─────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Retrieve relevant hints for a slice implementation",
    )
    parser.add_argument("--discoveries", default="/tmp/learned-discoveries.json")
    parser.add_argument("--context", required=True)
    parser.add_argument("--slice", required=True)
    parser.add_argument("--todo-files", required=True,
                        help="Comma-separated list of files with TODOs")
    parser.add_argument("--max-hints", type=int, default=5)
    parser.add_argument("--mode", choices=["fast", "deep"], default="deep",
                        help="fast = approved only; deep = approved + candidate")
    parser.add_argument("--format", choices=["json", "prompt"], default="json",
                        help="Output format: structured JSON or prompt text")
    args = parser.parse_args()

    todo_files = [f.strip() for f in args.todo_files.split(",") if f.strip()]

    results = retrieve(
        discoveries_path=Path(args.discoveries),
        context=args.context,
        slice_name=args.slice,
        todo_files=todo_files,
        max_hints=args.max_hints,
        mode=args.mode,
    )

    if args.format == "prompt":
        text = format_for_prompt(results)
        if text:
            print(text)
        else:
            print("(no relevant hints found)", file=sys.stderr)
    else:
        output = {
            "query": {
                "context": args.context,
                "slice": args.slice,
                "todo_files": todo_files,
                "max_hints": args.max_hints,
                "mode": args.mode,
            },
            "count": len(results),
            "hints": results,
        }
        print(json.dumps(output, indent=2, default=str))


if __name__ == "__main__":
    main()
