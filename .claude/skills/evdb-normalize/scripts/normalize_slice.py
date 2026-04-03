#!/usr/bin/env python3
"""
normalize_slice.py — IR normalizer for the evdb compiler pipeline.

Reads a slice.json (external, never modified) and produces a canonical
Intermediate Representation (IR) in .eventmodel/.normalized/<Context>/<sliceDir>.normalized.json.

Design principles (Option C):
  - Every deterministic value is extracted and recorded with full provenance.
  - Predicate boolean expressions are left as null with review_required: true.
    The normalizer NEVER guesses — it does not infer 'amount <= 0' from
    'amount is zero or negative'.
  - The _provenance section maps every derived key to its source + rule.

Schema version: 2.0

Usage:
    python3 normalize_slice.py <slice.json>
    python3 normalize_slice.py <slice.json> --output <out.normalized.json>
    python3 normalize_slice.py --all --root <repo_root>
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


# ---------------------------------------------------------------------------
# Derivation rule registry
#
# Every rule name that appears in _provenance must be defined here.
# This is the "why does this value exist" reference for engineers.
# ---------------------------------------------------------------------------

DERIVATION_RULES: dict[str, str] = {
    "PASSTHROUGH":
        "Value copied directly from source without transformation.",

    "PASCAL_CASE_FROM_TITLE":
        "Title words split on whitespace, each word capitalized and joined. "
        "Single-word inputs preserve existing casing (first letter uppercased only). "
        "Example: 'Approve Withdrawal' → 'ApproveWithdrawal'.",

    "CAMEL_CASE_FROM_TITLE":
        "Pascal case with first letter lowercased. "
        "Example: 'Approve Withdrawal' → 'approveWithdrawal'.",

    "SLUG_FROM_TITLE":
        "Remove 'slice:' prefix, strip spaces and hyphens, lowercase all. "
        "Example: 'slice: Withdrawal Approval' → 'withdrawalapproval'.",

    "FIELD_CAMEL_CASE":
        "First character lowercased, rest preserved. "
        "Example: 'ApprovalDate' → 'approvalDate'.",

    "EVDB_TYPE_TO_TS_TYPE":
        "evdb model type → TypeScript type. "
        "UUID→string, String→string, Double→number, Integer→number, "
        "Long→number, Float→number, Boolean→boolean, DateTime→Date, Date→Date.",

    "VIEW_NAME_FROM_COMMAND":
        "View named after the command class (scaffold convention), not slice title. "
        "Example: command 'Approve Withdrawal' → view 'SliceStateApproveWithdrawal'.",

    "VIEW_FIELDS_FROM_GIVEN_EVENTS":
        "State fields collected from spec.given[].fields across all specifications. "
        "Fields deduplicated, order-preserving. hasGivenEvents=true if any spec has given[].",

    "INPUT_FIELDS_SPLIT":
        "fields[] partitioned into inputFields (generated:false) and generatedFields (generated:true).",

    "OUTBOUND_EVENTS_FROM_DEPS":
        "Titles of command.dependencies[] where type=OUTBOUND and elementType=EVENT.",

    "REVIEW_REQUIRED":
        "Cannot be deterministically derived from structured data alone. "
        "Requires human or AI review. The hint field contains the source text as a cue.",

    "PROCESSOR_FIELDS_SPLIT":
        "Processor fields[] partitioned into inputFields (generated:false) and "
        "enrichedFields (generated:true). Input fields come from the trigger readmodel; "
        "enriched fields are computed by the enrichment function.",

    "BACKEND_PROMPTS_PASSTHROUGH":
        "codeGen.backendPrompts[] copied verbatim from the slice or config. "
        "These are natural-language instructions for the AI to implement the enrichment logic.",

    "PROCESSOR_DEPENDENCIES":
        "Processor inbound/outbound dependency titles extracted from processors[].dependencies[].",

    "PROCESSOR_TRIGGERS":
        "Trigger events that activate the processor. Extracted from processors[].triggers[]. "
        "Each trigger maps to a Kafka topic subscription (events.{triggerTitle}).",

    "PROCESSOR_DESCRIPTION_PASSTHROUGH":
        "Per-component description copied verbatim from the processor element. "
        "In .eventmodel2 format, this replaces slice-level backendPrompts as the "
        "enrichment implementation instructions for the AI.",

    "PROCESSOR_SOURCE_TYPE":
        "Delivery source derived from INBOUND dependency elementType: "
        "EVENT → 'message' (cross-boundary Kafka CDC), READMODEL → 'event' (same-context outbox trigger).",
}


# ---------------------------------------------------------------------------
# Type mapping: evdb model types → TypeScript types
# ---------------------------------------------------------------------------

TS_TYPE_MAP = {
    "UUID": "string",
    "String": "string",
    "Double": "number",
    "Integer": "number",
    "Long": "number",
    "Float": "number",
    "Boolean": "boolean",
    "DateTime": "Date",
    "Date": "Date",
    "Decimal": "number",
    "Object": "Record<string, unknown>",
    "Array": "unknown[]",
}


def to_ts_type(evdb_type: str) -> str:
    return TS_TYPE_MAP.get(evdb_type, "unknown")


# ---------------------------------------------------------------------------
# Naming helpers
# ---------------------------------------------------------------------------

def to_class_name(title: str) -> str:
    """
    'Approve Withdrawal' → 'ApproveWithdrawal'   (multi-word: full capitalize)
    'ApprovalDate'       → 'ApprovalDate'         (single-word: preserve casing)
    'session'            → 'Session'              (single-word: uppercase first)
    """
    words = [w for w in re.split(r"[\s\-_]+", title.strip()) if w]
    if len(words) == 1:
        w = words[0]
        return w[0].upper() + w[1:] if w else w
    return "".join(w.capitalize() for w in words)


def to_camel_name(title: str) -> str:
    """'Approve Withdrawal' → 'approveWithdrawal'"""
    words = [w for w in re.split(r"[\s\-_]+", title.strip()) if w]
    if not words:
        return ""
    return words[0].lower() + "".join(w.capitalize() for w in words[1:])


def to_slice_dir(slice_title: str) -> str:
    """'slice: Withdrawal Approval' → 'withdrawalapproval'"""
    name = re.sub(r"^slice:\s*", "", slice_title, flags=re.IGNORECASE).strip()
    return re.sub(r"[\s\-_]+", "", name).lower()


def to_field_camel(name: str) -> str:
    """'ApprovalDate' → 'approvalDate', 'account' → 'account'"""
    if name and name[0].isupper():
        return name[0].lower() + name[1:]
    return name


# ---------------------------------------------------------------------------
# Provenance collector
# ---------------------------------------------------------------------------

class Provenance:
    """Tracks how every derived IR value was produced.

    Each record maps a dotpath key (e.g. 'naming.commandClassName') to:
      source      — path in slice.json that drove this value
      value       — the derived value (for quick reference)
      rule        — key into DERIVATION_RULES
      deterministic — true if the value can always be re-derived identically
    """

    def __init__(self):
        self._entries: dict[str, dict] = {}

    def record(self, key: str, *, source: str, value, rule: str, deterministic: bool = True):
        self._entries[key] = {
            "source": source,
            "value": value,
            "rule": rule,
            "deterministic": deterministic,
        }

    def to_dict(self) -> dict:
        return dict(self._entries)


# ---------------------------------------------------------------------------
# Field normalization
# ---------------------------------------------------------------------------

def normalize_field(f: dict, source_prefix: str) -> dict:
    name = f.get("name", "")
    evdb_type = f.get("type", "String")
    return {
        "name": name,
        "camelName": to_field_camel(name),
        "className": to_class_name(name),
        "evdbType": evdb_type,
        "tsType": to_ts_type(evdb_type),
        "generated": f.get("generated", False),
        "idAttribute": f.get("idAttribute", False),
        "cardinality": f.get("cardinality", "Single"),
        "example": f.get("example", ""),
        "subfields": f.get("subfields", []),
        # Inline source reference for field-level traceability
        "_src": source_prefix,
    }


# ---------------------------------------------------------------------------
# Spec scenario normalization
# ---------------------------------------------------------------------------

def normalize_spec_fields(fields: list) -> list:
    return [
        {
            "name": f.get("name", ""),
            "camelName": to_field_camel(f.get("name", "")),
            "tsType": to_ts_type(f.get("type", "String")),
            "example": f.get("example", ""),
            "generated": f.get("generated", False),
        }
        for f in fields
    ]


def normalize_spec(spec: dict, spec_index: int) -> dict:
    given = spec.get("given", [])
    when_list = spec.get("when", [])
    then_list = spec.get("then", [])
    comment = ""
    comments = spec.get("comments", [])
    if comments:
        comment = comments[0].get("description", "")

    when_item = when_list[0] if when_list else None
    when_norm = None
    if when_item:
        when_norm = {
            "commandTitle": when_item.get("title", ""),
            "commandClassName": to_class_name(when_item.get("title", "")),
            "fields": normalize_spec_fields(when_item.get("fields", [])),
            "linkedId": when_item.get("linkedId"),
        }

    then_norm = []
    for then_item in then_list:
        then_norm.append({
            "eventTitle": then_item.get("title", ""),
            "eventClassName": to_class_name(then_item.get("title", "")),
            "fields": normalize_spec_fields(then_item.get("fields", [])),
            "linkedId": then_item.get("linkedId"),
        })

    given_norm = []
    for g in given:
        given_norm.append({
            "eventTitle": g.get("title", ""),
            "eventClassName": to_class_name(g.get("title", "")),
            "fields": normalize_spec_fields(g.get("fields", [])),
            "linkedId": g.get("linkedId"),
        })

    predicate = {
        "expression": None,
        "review_required": True,
        "hint": comment if comment else None,
        # Source kept here so the verifier/AI can find the raw text
        "_src": f"specifications[{spec_index}].comments[0].description",
    }

    return {
        "id": spec.get("id"),
        "title": spec.get("title", ""),
        "comment": comment,
        "given": given_norm,
        "when": when_norm,
        "then": then_norm,
        "predicate": predicate,
    }


# ---------------------------------------------------------------------------
# View state analysis
# ---------------------------------------------------------------------------

def derive_view_info(command_class_name: str, specifications: list,
                     events_by_title: dict) -> dict:
    """
    Derive SliceState<X> view name and state fields from given events in specs.

    Naming follows scaffold convention: view named after command, not slice title.
    Rule: VIEW_NAME_FROM_COMMAND + VIEW_FIELDS_FROM_GIVEN_EVENTS
    """
    state_fields: list[str] = []
    has_given = False

    for spec in specifications:
        given = spec.get("given", [])
        if given:
            has_given = True
            for g in given:
                event_title = g.get("title", "")
                ev = events_by_title.get(event_title)
                if ev:
                    for f in ev.get("fields", []):
                        name = to_field_camel(f.get("name", ""))
                        if name and name not in state_fields:
                            state_fields.append(name)

    return {
        "viewName": f"SliceState{command_class_name}",
        "hasGivenEvents": has_given,
        "stateFields": state_fields,
    }


# ---------------------------------------------------------------------------
# Processor / enrichment normalization
# ---------------------------------------------------------------------------

def normalize_processor(proc: dict, proc_index: int, prov: Provenance) -> dict:
    """Normalize an AUTOMATION processor into input/enriched field splits."""
    title = proc.get("title", "")
    proc_class = to_class_name(title)
    fields = [
        normalize_field(f, f"processors[{proc_index}].fields[{fi}]")
        for fi, f in enumerate(proc.get("fields", []))
    ]
    input_fields = [f for f in fields if not f["generated"]]
    enriched_fields = [f for f in fields if f["generated"]]

    prov.record(f"processors[{proc_index}].inputFields",
                source=f"processors[{proc_index}].fields[generated=false]",
                value=[f["name"] for f in input_fields],
                rule="PROCESSOR_FIELDS_SPLIT")
    prov.record(f"processors[{proc_index}].enrichedFields",
                source=f"processors[{proc_index}].fields[generated=true]",
                value=[f["name"] for f in enriched_fields],
                rule="PROCESSOR_FIELDS_SPLIT")

    # Dependencies
    inbound = []
    outbound = []
    for dep in proc.get("dependencies", []):
        entry = {"id": dep.get("id"), "title": dep.get("title", ""),
                 "elementType": dep.get("elementType", "")}
        if dep.get("type") == "INBOUND":
            inbound.append(entry)
        elif dep.get("type") == "OUTBOUND":
            outbound.append(entry)

    prov.record(f"processors[{proc_index}].dependencies",
                source=f"processors[{proc_index}].dependencies[]",
                value={"inbound": [d["title"] for d in inbound],
                       "outbound": [d["title"] for d in outbound]},
                rule="PROCESSOR_DEPENDENCIES")

    # Triggers (.eventmodel2: populated array of {title, id} for event subscriptions)
    triggers = proc.get("triggers", [])
    trigger_titles = [t.get("title", "") for t in triggers]
    if trigger_titles:
        prov.record(f"processors[{proc_index}].triggers",
                    source=f"processors[{proc_index}].triggers[]",
                    value=trigger_titles,
                    rule="PROCESSOR_TRIGGERS")

    # Per-component description (.eventmodel2: enrichment instructions on each component)
    description = proc.get("description", "")
    if description:
        prov.record(f"processors[{proc_index}].description",
                    source=f"processors[{proc_index}].description",
                    value=f"{len(description)} chars",
                    rule="PROCESSOR_DESCRIPTION_PASSTHROUGH")

    # Source type: derive from INBOUND dependency elementType
    # EVENT → "message" (cross-boundary Kafka CDC)
    # READMODEL → "event" (same-context outbox trigger)
    source_type = "event"  # default: same-context
    for dep in inbound:
        if dep.get("elementType") == "EVENT":
            source_type = "message"
            break

    prov.record(f"processors[{proc_index}].sourceType",
                source=f"processors[{proc_index}].dependencies[type=INBOUND].elementType",
                value=source_type,
                rule="PROCESSOR_SOURCE_TYPE")

    return {
        "id": proc.get("id"),
        "title": title,
        "className": proc_class,
        "type": proc.get("type", ""),
        "fields": fields,
        "inputFields": input_fields,
        "enrichedFields": enriched_fields,
        "inbound": inbound,
        "outbound": outbound,
        "triggers": triggers,
        "triggerTitles": trigger_titles,
        "description": description,
        "sourceType": source_type,
    }


# ---------------------------------------------------------------------------
# Main normalization
# ---------------------------------------------------------------------------

def normalize(slice_path: Path, source_root: Path) -> dict:
    raw = json.loads(slice_path.read_text())
    prov = Provenance()

    slice_title = raw.get("title", "")
    context = raw.get("context", "")
    slice_dir_name = to_slice_dir(slice_title)
    slice_class_name = to_class_name(
        re.sub(r"^slice:\s*", "", slice_title, flags=re.IGNORECASE).strip()
    )

    # ── Naming provenance ────────────────────────────────────────────────
    prov.record("naming.sliceName",
                source="slice.title", value=slice_class_name,
                rule="PASCAL_CASE_FROM_TITLE")
    prov.record("naming.sliceDir",
                source="slice.title", value=slice_dir_name,
                rule="SLUG_FROM_TITLE")

    # ── Command ──────────────────────────────────────────────────────────
    events = raw.get("events", [])
    events_by_title = {e.get("title", ""): e for e in events}

    commands = raw.get("commands", [])
    cmd_raw = commands[0] if commands else {}
    cmd_title = cmd_raw.get("title", "")
    cmd_class = to_class_name(cmd_title)
    cmd_handler = to_camel_name(cmd_title)

    prov.record("naming.commandClassName",
                source="commands[0].title", value=cmd_class,
                rule="PASCAL_CASE_FROM_TITLE")
    prov.record("naming.commandHandlerName",
                source="commands[0].title", value=cmd_handler,
                rule="CAMEL_CASE_FROM_TITLE")

    cmd_fields = [
        normalize_field(f, f"commands[0].fields[{i}]")
        for i, f in enumerate(cmd_raw.get("fields", []))
    ]

    # Record type mapping rule for each unique evdb type used
    seen_types: set[str] = set()
    for i, f in enumerate(cmd_raw.get("fields", [])):
        evdb_t = f.get("type", "String")
        if evdb_t not in seen_types:
            seen_types.add(evdb_t)
            prov.record(f"types.{evdb_t}",
                        source=f"commands[0].fields type='{evdb_t}'",
                        value=to_ts_type(evdb_t),
                        rule="EVDB_TYPE_TO_TS_TYPE")

    outbound_events = [
        d.get("title")
        for d in cmd_raw.get("dependencies", [])
        if d.get("type") == "OUTBOUND"
    ]
    prov.record("command.outboundEvents",
                source="commands[0].dependencies[type=OUTBOUND]",
                value=outbound_events,
                rule="OUTBOUND_EVENTS_FROM_DEPS")
    prov.record("command.inputFields",
                source="commands[0].fields[generated=false]",
                value=[f["name"] for f in cmd_fields if not f["generated"]],
                rule="INPUT_FIELDS_SPLIT")

    command = {
        "id": cmd_raw.get("id"),
        "title": cmd_title,
        "className": cmd_class,
        "handlerName": cmd_handler,
        "aggregate": cmd_raw.get("aggregate", ""),
        "createsAggregate": cmd_raw.get("createsAggregate", False),
        "fields": cmd_fields,
        "inputFields": [f for f in cmd_fields if not f["generated"]],
        "generatedFields": [f for f in cmd_fields if f["generated"]],
        "outboundEvents": outbound_events,
    }

    # ── Events ───────────────────────────────────────────────────────────
    events_norm = []
    for ei, ev in enumerate(events):
        ev_fields = [
            normalize_field(f, f"events[{ei}].fields[{fi}]")
            for fi, f in enumerate(ev.get("fields", []))
        ]
        ev_class = to_class_name(ev.get("title", ""))
        prov.record(f"events[{ei}].className",
                    source=f"events[{ei}].title",
                    value=ev_class,
                    rule="PASCAL_CASE_FROM_TITLE")
        events_norm.append({
            "id": ev.get("id"),
            "title": ev.get("title", ""),
            "className": ev_class,
            "aggregate": ev.get("aggregate", ""),
            "createsAggregate": ev.get("createsAggregate", False),
            "fields": ev_fields,
            "inputFields": [f for f in ev_fields if not f["generated"]],
            "generatedFields": [f for f in ev_fields if f["generated"]],
        })

    # ── Specifications ───────────────────────────────────────────────────
    specs_raw = raw.get("specifications", [])
    specs_norm = [normalize_spec(s, i) for i, s in enumerate(specs_raw)]

    for i in range(len(specs_norm)):
        prov.record(f"specifications[{i}].predicate",
                    source=f"specifications[{i}].comments[0].description",
                    value=None,
                    rule="REVIEW_REQUIRED",
                    deterministic=False)

    # ── View ─────────────────────────────────────────────────────────────
    view = derive_view_info(cmd_class, specs_raw, events_by_title)
    prov.record("view.viewName",
                source="commands[0].title",
                value=view["viewName"],
                rule="VIEW_NAME_FROM_COMMAND")
    prov.record("view.stateFields",
                source="specifications[*].given[*].fields",
                value=view["stateFields"],
                rule="VIEW_FIELDS_FROM_GIVEN_EVENTS")

    # ── Processors (AUTOMATION) ─────────────────────────────────────────
    processors_raw = raw.get("processors", [])
    processors_norm = [
        normalize_processor(p, i, prov)
        for i, p in enumerate(processors_raw)
        if p.get("type") == "AUTOMATION"
    ]

    # ── Backend prompts (codeGen.backendPrompts or processor descriptions) ──
    # In .eventmodel format: slice-level codeGen.backendPrompts[]
    # In .eventmodel2 format: per-component processor.description
    backend_prompts = []
    slice_codegen = raw.get("codeGen", {})
    if slice_codegen.get("backendPrompts"):
        backend_prompts.extend(slice_codegen["backendPrompts"])
        prov.record("backendPrompts",
                    source="codeGen.backendPrompts[]",
                    value=f"{len(backend_prompts)} prompt(s)",
                    rule="BACKEND_PROMPTS_PASSTHROUGH")
    elif not backend_prompts:
        # Fall back to processor descriptions (.eventmodel2 pattern)
        for pi, p in enumerate(processors_norm):
            if p.get("description"):
                backend_prompts.append(p["description"])
        if backend_prompts:
            prov.record("backendPrompts",
                        source="processors[*].description",
                        value=f"{len(backend_prompts)} prompt(s) from processor descriptions",
                        rule="PROCESSOR_DESCRIPTION_PASSTHROUGH")

    # ── Source path ──────────────────────────────────────────────────────
    try:
        rel_source = str(slice_path.relative_to(source_root))
    except ValueError:
        rel_source = str(slice_path)

    return {
        "schema_version": "2.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": rel_source,
        "slice": {
            "id": raw.get("id"),
            "status": raw.get("status", ""),
            "title": slice_title,
            "context": context,
            "sliceType": raw.get("sliceType", ""),
            "aggregate": cmd_raw.get("aggregate", ""),
            "createsAggregate": cmd_raw.get("createsAggregate", False),
        },
        "naming": {
            "sliceName": slice_class_name,
            "sliceDir": slice_dir_name,
            "commandClassName": cmd_class,
            "commandHandlerName": cmd_handler,
        },
        "command": command,
        "events": events_norm,
        "specifications": specs_norm,
        "view": view,
        "processors": processors_norm,
        "backendPrompts": backend_prompts,
        # Provenance section: maps every derived key → {source, value, rule, deterministic}
        "_provenance": prov.to_dict(),
        # Rule registry included inline so the file is self-contained
        "_rules": DERIVATION_RULES,
    }


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

def output_path_for(slice_path: Path, root: Path) -> Path:
    """Derive .eventmodel[2]/.normalized/<Context>/<sliceDir>.normalized.json

    Uses .eventmodel2/.normalized/ for slices sourced from .eventmodel2/,
    and .eventmodel/.normalized/ for slices from .eventmodel/.
    """
    raw = json.loads(slice_path.read_text())
    context = raw.get("context", "unknown")
    slice_title = raw.get("title", "")
    slice_dir = to_slice_dir(slice_title)
    # Determine which eventmodel root this slice belongs to
    eventmodel_base = ".eventmodel2" if ".eventmodel2" in str(slice_path) else ".eventmodel"
    return root / eventmodel_base / ".normalized" / context / f"{slice_dir}.normalized.json"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="evdb IR normalizer — Option C (deterministic extraction only)"
    )
    parser.add_argument("slice", nargs="?", help="Path to slice.json")
    parser.add_argument("--output", "-o", help="Output path (default: auto-derived)")
    parser.add_argument("--all", action="store_true", help="Normalize all slices under --root")
    parser.add_argument("--root", default=".", help="Repo root (default: .)")
    parser.add_argument("--dry-run", action="store_true", help="Print output without writing")
    args = parser.parse_args()

    root = Path(args.root).resolve()

    if args.all:
        # Scan both .eventmodel and .eventmodel2 for slice.json files
        slice_files = []
        for em_dir_name in [".eventmodel", ".eventmodel2"]:
            slices_dir = root / em_dir_name / ".slices"
            if slices_dir.exists():
                slice_files.extend(slices_dir.rglob("slice.json"))
        if not slice_files:
            print("No slice.json files found.", file=sys.stderr)
            sys.exit(1)
        errors = []
        for sp in sorted(slice_files):
            try:
                result = normalize(sp, root)
                out = output_path_for(sp, root)
                if args.dry_run:
                    print(f"[dry-run] {sp.relative_to(root)} → {out.relative_to(root)}")
                else:
                    out.parent.mkdir(parents=True, exist_ok=True)
                    out.write_text(json.dumps(result, indent=2))
                    print(f"OK  {out.relative_to(root)}")
            except Exception as e:
                errors.append((sp, str(e)))
                print(f"ERR {sp}: {e}", file=sys.stderr)
        if errors:
            sys.exit(1)
        return

    if not args.slice:
        parser.print_help()
        sys.exit(1)

    slice_path = Path(args.slice).resolve()
    if not slice_path.exists():
        print(f"ERROR: {slice_path} not found", file=sys.stderr)
        sys.exit(1)

    result = normalize(slice_path, root)

    if args.output:
        out = Path(args.output)
    else:
        out = output_path_for(slice_path, root)

    if args.dry_run:
        print(json.dumps(result, indent=2))
        print(f"\n[dry-run] would write to: {out}", file=sys.stderr)
    else:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, indent=2))
        print(f"OK  {out}")


if __name__ == "__main__":
    main()
