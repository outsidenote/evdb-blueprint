#!/usr/bin/env python3
"""
Deterministic scaffold generator for evdb slices.

Reads slice.json and generates all TypeScript boilerplate files.
Command handler body is left as a TODO for AI to fill in.

Usage:
  python3 evdb_scaffold.py --root <project-root> --slice <folder>
  python3 evdb_scaffold.py --root <project-root> --all-planned
  python3 evdb_scaffold.py --root <project-root> --slice <folder> --dry-run
"""

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path


# ──────────────────────────────────────────────────────────────────────
# Type mapping
# ──────────────────────────────────────────────────────────────────────

TYPE_MAP = {
    "UUID": "string",
    "String": "string",
    "Double": "number",
    "DateTime": "Date",
    "Integer": "number",
    "Boolean": "boolean",
    "Int": "number",
    "Decimal": "number",
    "Date": "Date",
    "Long": "number",
}


OPENAPI_TYPE_MAP = {
    "UUID": ("string", None),
    "String": ("string", None),
    "Double": ("number", None),
    "DateTime": ("string", "date-time"),
    "Integer": ("integer", None),
    "Boolean": ("boolean", None),
    "Int": ("integer", None),
    "Decimal": ("number", None),
    "Date": ("string", "date"),
    "Long": ("integer", None),
}


def openapi_type(field_type: str) -> dict:
    """Convert event model type to OpenAPI schema type."""
    t, fmt = OPENAPI_TYPE_MAP.get(field_type, ("string", None))
    result: dict = {"type": t}
    if fmt:
        result["format"] = fmt
    return result


def ts_type(field_type: str) -> str:
    return TYPE_MAP.get(field_type, "string")


# ──────────────────────────────────────────────────────────────────────
# Name helpers
# ──────────────────────────────────────────────────────────────────────

def pascal_case(s: str) -> str:
    """Convert 'Fund Deposit' or 'funddeposit' to 'FundDeposit'."""
    # If already PascalCase, return as-is
    if re.match(r'^[A-Z][a-zA-Z0-9]*$', s) and ' ' not in s:
        return s
    # Split on spaces or transitions
    words = re.split(r'[\s_-]+', s)
    return ''.join(w.capitalize() for w in words if w)


def camel_case(s: str) -> str:
    p = pascal_case(s)
    return p[0].lower() + p[1:] if p else p


def event_name_from_title(title: str, context: str) -> str:
    """Convert event title to TypeScript event name.

    Follows the convention: context prefix + title words in PascalCase.
    e.g. 'Withdrawal Fee Calculated' in context 'Funds' stays as-is
    since the event model title is already the canonical name.
    """
    return pascal_case(title)


def interface_name(event_name: str) -> str:
    return f"I{event_name}"


def field_name(name: str) -> str:
    """Ensure field name is camelCase."""
    if not name:
        return name
    return name[0].lower() + name[1:]


def predicate_name(description: str) -> str:
    """Convert spec description to a valid camelCase JS identifier.

    'Insufficient Effective Funds  Withdrawals' → 'insufficientEffectiveFundsWithdrawals'
    'isVipCustomer' → 'isVipCustomer' (already valid)
    'isSameAccount' → 'isSameAccount' (already valid)
    """
    if not description:
        return "unknownPredicate"
    # If already a valid camelCase identifier, use as-is
    if re.match(r'^[a-zA-Z_$][a-zA-Z0-9_$]*$', description):
        return description
    # Split on whitespace, camelCase it
    words = re.split(r'\s+', description.strip())
    words = [w for w in words if w]
    if not words:
        return "unknownPredicate"
    result = words[0].lower() + ''.join(w.capitalize() for w in words[1:])
    # Remove any non-identifier chars
    result = re.sub(r'[^a-zA-Z0-9_$]', '', result)
    return result or "unknownPredicate"


def slice_name_pascal(slice_data: dict) -> str:
    """Get PascalCase slice name from the command title (not the slice title).

    The command title drives naming: 'Approve Withdrawal' → 'ApproveWithdrawal'.
    Falls back to the slice title if no commands exist.
    """
    commands = slice_data.get("commands", [])
    if commands:
        return pascal_case(commands[0]["title"])
    # Fallback for non-command slices (projections, processors)
    title = slice_data.get("title", "")
    title = re.sub(r'^slice:\s*', '', title)
    return pascal_case(title)


def stream_name(context: str) -> str:
    """Stream name = context name (e.g. 'Funds')."""
    return pascal_case(context)


def command_name_pascal(cmd: dict) -> str:
    return pascal_case(cmd["title"])


def kebab_case(s: str) -> str:
    """Convert PascalCase to kebab-case for URL routes."""
    s1 = re.sub(r'([A-Z])', r'-\1', s).strip('-').lower()
    return re.sub(r'-+', '-', s1)


# ──────────────────────────────────────────────────────────────────────
# Field helpers (centralised)
# ──────────────────────────────────────────────────────────────────────

def field_ts_decl(f: dict, pgboss_payload: bool = False) -> str:
    """Generate a single TypeScript interface field declaration.

    Returns e.g. '  readonly accountId: string;'
    For pg-boss payloads, Date fields become 'string | Date' since JSON
    serialization converts dates to strings.
    """
    fn = field_name(f["name"])
    ft = ts_type(f.get("type", "String"))
    if pgboss_payload and ft == "Date":
        ft = "string | Date"
    return f"  readonly {fn}: {ft};"


def split_fields(fields: list[dict]) -> tuple[list[dict], list[dict]]:
    """Split fields into (user_fields, generated_fields)."""
    user = [f for f in fields if not f.get("generated")]
    generated = [f for f in fields if f.get("generated")]
    return user, generated


def extract_predicate(spec: dict) -> str:
    """Extract predicate name from a spec's comments, falling back to spec title."""
    comments = spec.get("comments", [])
    if comments and comments[0].get("description"):
        return predicate_name(comments[0]["description"])
    # Fallback: derive from spec title (strip "spec: " prefix, camelCase it)
    title = spec.get("title", "")
    if title:
        title = re.sub(r'^spec:\s*', '', title, flags=re.IGNORECASE).strip()
        if title:
            return predicate_name(title)
    return "unknownPredicate"


def derive_message_type(trigger: dict) -> str:
    """Derive the message type string from trigger info."""
    if trigger.get("trigger_event"):
        return pascal_case(trigger["trigger_event"])
    if trigger.get("trigger_readmodel"):
        return pascal_case(trigger["trigger_readmodel"].replace("TODO", "").replace("To-Do", "").strip())
    return "Unknown"


def map_event_field_line(f: dict, cmd_field_names: set[str], indent: str) -> str:
    """Map a single event field to its command handler line.

    If the field exists on the command, maps directly.
    Otherwise generates a TODO default based on field type.
    """
    fn = field_name(f["name"])
    if fn in cmd_field_names:
        return f"{indent}{fn}: command.{fn},"

    ft = f.get("type", "String")
    example = f.get("example", "")
    hint = f" — example: {example}" if example else ""
    if ft == "String":
        return f'{indent}{fn}: "", // TODO: derive from command fields{hint}'
    elif ft in ("Double", "Integer", "Int"):
        return f"{indent}{fn}: 0, // TODO: calculate from command fields{hint}"
    elif ft == "DateTime":
        return f"{indent}{fn}: new Date(), // TODO: computed field{hint}"
    else:
        return f'{indent}{fn}: "", // TODO: derive from command fields{hint}'


def ts_type_check_assertion(fn: str, ft: str, source: str) -> str:
    """Generate a type-check assertion line for enrichment/automation tests."""
    if ft in ("Double", "Integer", "Int", "Decimal", "Float"):
        return f'    assert.strictEqual(typeof {source}.{fn}, "number");'
    elif ft in ("DateTime", "Date"):
        return f"    assert.ok({source}.{fn} instanceof Date);"
    else:
        return f'    assert.strictEqual(typeof {source}.{fn}, "string");'


def _format_example(f: dict) -> str:
    """Format a field's example value as TypeScript literal."""
    example = f.get("example", "")
    ft = f.get("type", "String")
    if ft in ("Double", "Integer", "Int"):
        try:
            return str(float(example)) if "." in str(example) else str(int(example))
        except (ValueError, TypeError):
            return "0"
    if ft in ("DateTime", "Date"):
        if not example:
            return 'new Date("2025-01-01T11:00:00Z")'
        # Normalize "YYYY-MM-DD HH:MM" (space separator, no timezone) → ISO UTC
        import re as _re
        if _re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$", example.strip()):
            example = example.strip().replace(" ", "T") + ":00Z"
        return f'new Date("{example}")'
    if ft == "Boolean":
        return "true" if example.lower() in ("true", "1", "yes") else "false"
    # String / UUID — generate sensible default when no example
    if example:
        return f'"{example}"'
    fn = field_name(f.get("name", ""))
    if ft == "UUID":
        return f'"test-{fn}-001"'
    return f'"test-{fn}"'


# ──────────────────────────────────────────────────────────────────────
# Derived model
# ──────────────────────────────────────────────────────────────────────

@dataclass
class DerivedSlice:
    """Precomputed slice metadata passed to all generators.

    Computed once from raw slice_data or .normalized.json, avoids redundant derivation.
    """
    raw: dict
    slice_name: str
    slice_name_camel: str
    stream: str
    context: str

    # Command
    command: dict
    command_fields: list
    user_fields: list
    generated_fields: list
    command_field_names: set
    has_commands: bool

    # Events & specs
    events: list
    specs: list
    has_specs: bool
    predicates: list

    # Automation / trigger
    is_automation: bool
    trigger_info: dict
    message_type: str
    has_enrichment: bool

    # Slice type flags
    is_projection: bool = False
    backend_prompts: list = None

    # Cross-slice event resolution
    event_id_map: dict = None

    def __post_init__(self):
        if self.backend_prompts is None:
            self.backend_prompts = []
        if self.event_id_map is None:
            self.event_id_map = {}


def derive_slice(slice_data: dict, event_id_map: dict[str, str] | None = None) -> DerivedSlice:
    """Build a DerivedSlice from raw slice_data."""
    sn = slice_name_pascal(slice_data)
    context = slice_data["context"]
    cmd = slice_data["commands"][0] if slice_data.get("commands") else {}
    cmd_fields = cmd.get("fields", [])
    user, generated = split_fields(cmd_fields)
    specs = slice_data.get("specifications", [])
    events = slice_data.get("events", [])

    is_auto = is_automation_slice(slice_data)
    trigger = get_trigger_info(slice_data) if is_auto else {}

    # Enrichment: automation with generated processor fields + description
    payload_fields = trigger.get("payload_fields", [])
    has_enrich = (
        any(f.get("generated") for f in payload_fields) and bool(trigger.get("description"))
    ) if is_auto else False

    # Backend prompts
    bp = slice_data.get("codeGen", {}).get("backendPrompts", [])
    if not bp:
        for proc in slice_data.get("processors", []):
            if proc.get("type") == "AUTOMATION" and proc.get("description"):
                bp.append(proc["description"])

    return DerivedSlice(
        raw=slice_data,
        slice_name=sn,
        slice_name_camel=camel_case(sn),
        stream=stream_name(context),
        context=context,
        command=cmd,
        command_fields=cmd_fields,
        user_fields=user,
        generated_fields=generated,
        command_field_names={field_name(f["name"]) for f in cmd_fields},
        has_commands=bool(slice_data.get("commands")),
        events=events,
        specs=specs,
        has_specs=bool(specs),
        predicates=[extract_predicate(s) for s in specs],
        is_automation=is_auto,
        trigger_info=trigger,
        message_type=derive_message_type(trigger) if is_auto else "",
        has_enrichment=has_enrich,
        is_projection=(
            slice_data.get("sliceType") == "STATE_VIEW"
            and bool(slice_data.get("readmodels"))
            and not slice_data.get("commands")
            # Exclude TODO lists (automation work queues — handled by pg-boss, not Kafka)
            and not any(rm.get("todoList") for rm in slice_data.get("readmodels", []))
        ),
        backend_prompts=bp,
        event_id_map=event_id_map or {},
    )


# ──────────────────────────────────────────────────────────────────────
# Normalized JSON consumer (compat shim)
# ──────────────────────────────────────────────────────────────────────

def _compat_field(nf: dict) -> dict:
    """Adapt a normalized field back to raw slice.json field shape.

    Generators expect f["name"], f.get("type"), f.get("generated"), f.get("example"),
    f.get("idAttribute"). Normalized fields use camelName, evdbType, etc.
    This shim bridges the gap so generators work unchanged.
    """
    return {
        "name": nf.get("name", nf.get("camelName", "")),
        "type": nf.get("evdbType", "String"),
        "generated": nf.get("generated", False),
        "example": nf.get("example", ""),
        "idAttribute": nf.get("idAttribute", False),
        "cardinality": nf.get("cardinality", "Single"),
    }


def _compat_fields(nf_list: list) -> list:
    """Convert a list of normalized fields to raw shape."""
    return [_compat_field(f) for f in nf_list]


def _compat_spec(ns: dict) -> dict:
    """Adapt a normalized spec back to raw slice.json spec shape."""
    given = []
    for g in ns.get("given", []):
        given.append({
            "title": g.get("eventTitle", ""),
            "linkedId": g.get("linkedId"),
            "fields": _compat_fields(g.get("fields", [])),
        })

    when = []
    w = ns.get("when")
    if w:
        when.append({
            "title": w.get("commandTitle", ""),
            "linkedId": w.get("linkedId"),
            "fields": _compat_fields(w.get("fields", [])),
        })

    then = []
    for t in ns.get("then", []):
        then.append({
            "title": t.get("eventTitle", ""),
            "linkedId": t.get("linkedId"),
            "fields": _compat_fields(t.get("fields", [])),
        })

    return {
        "id": ns.get("id"),
        "title": ns.get("title", ""),
        "comments": [{"description": ns.get("comment", "")}] if ns.get("comment") else [],
        "given": given,
        "when": when,
        "then": then,
    }


def _compat_event(ne: dict) -> dict:
    """Adapt a normalized event back to raw slice.json event shape."""
    return {
        "id": ne.get("id"),
        "title": ne.get("title", ""),
        "fields": _compat_fields(ne.get("fields", [])),
        "aggregate": ne.get("aggregate", ""),
        "createsAggregate": ne.get("createsAggregate", False),
        "elementContext": ne.get("elementContext", "INTERNAL"),
    }


def _compat_readmodel(nr: dict) -> dict:
    """Adapt a normalized readmodel back to raw slice.json readmodel shape."""
    deps = []
    for d in nr.get("inbound", []):
        deps.append({"id": d.get("id"), "type": "INBOUND",
                      "title": d.get("title", ""), "elementType": d.get("elementType", "EVENT")})
    for d in nr.get("outbound", []):
        deps.append({"id": d.get("id"), "type": "OUTBOUND",
                      "title": d.get("title", ""), "elementType": d.get("elementType", "")})
    return {
        "id": nr.get("id"),
        "title": nr.get("title", ""),
        "description": nr.get("description", ""),
        "fields": _compat_fields(nr.get("fields", [])),
        "dependencies": deps,
        "todoList": nr.get("todoList", False),
    }


def _build_raw_compat(norm: dict) -> dict:
    """Build a raw-compatible dict from normalized data.

    This is stored as ds.raw so that generator functions like gen_projection(),
    get_enrichment_info(), etc. can read it in the same shape as raw slice.json.
    """
    flags = norm.get("flags", {})
    cmd = norm.get("command", {})

    # Rebuild commands array
    commands = []
    if cmd.get("title"):
        raw_cmd = {
            "title": cmd["title"],
            "aggregate": cmd.get("aggregate", ""),
            "createsAggregate": cmd.get("createsAggregate", False),
            "fields": _compat_fields(cmd.get("fields", [])),
            "dependencies": [
                {"type": "OUTBOUND", "elementType": "EVENT", "title": t}
                for t in cmd.get("outboundEvents", [])
            ],
        }
        if cmd.get("id"):
            raw_cmd["id"] = cmd["id"]
        commands.append(raw_cmd)

    # Rebuild events
    events = [_compat_event(e) for e in norm.get("events", [])]

    # Rebuild specifications
    specs = [_compat_spec(s) for s in norm.get("specifications", [])]

    # Rebuild processors
    processors = []
    for p in norm.get("processors", []):
        raw_proc = {
            "id": p.get("id"),
            "title": p.get("title", ""),
            "type": p.get("type", "AUTOMATION"),
            "fields": _compat_fields(p.get("fields", [])),
            "dependencies": [],
            "triggers": p.get("triggers", []),
            "description": p.get("description", ""),
        }
        for d in p.get("inbound", []):
            raw_proc["dependencies"].append({
                "id": d.get("id"), "type": "INBOUND",
                "title": d.get("title", ""), "elementType": d.get("elementType", ""),
            })
        for d in p.get("outbound", []):
            raw_proc["dependencies"].append({
                "id": d.get("id"), "type": "OUTBOUND",
                "title": d.get("title", ""), "elementType": d.get("elementType", ""),
            })
        processors.append(raw_proc)

    # Rebuild readmodels
    readmodels = [_compat_readmodel(r) for r in norm.get("readmodels", [])]

    # Rebuild codeGen
    codegen = {}
    bp = norm.get("backendPrompts", [])
    if bp:
        codegen["backendPrompts"] = bp

    return {
        "id": norm.get("slice", {}).get("id"),
        "title": norm.get("slice", {}).get("title", ""),
        "context": norm.get("slice", {}).get("context", ""),
        "status": norm.get("slice", {}).get("status", ""),
        "sliceType": norm.get("slice", {}).get("sliceType", ""),
        "commands": commands,
        "events": events,
        "specifications": specs,
        "processors": processors,
        "readmodels": readmodels,
        "codeGen": codegen,
    }


def build_event_id_map_from_normalized(root: Path, context: str, em_base: str) -> dict[str, str]:
    """Build event ID → class name map from .normalized.json files."""
    norm_dir = root / em_base / ".normalized" / context
    id_map = {}
    if not norm_dir.exists():
        return id_map
    for norm_file in norm_dir.glob("*.normalized.json"):
        with open(norm_file) as f:
            nd = json.load(f)
        for event in nd.get("events", []):
            eid = str(event.get("id", ""))
            if eid:
                id_map[eid] = event["className"]
    return id_map


def derive_slice_from_normalized(norm: dict, event_id_map: dict[str, str] | None = None) -> DerivedSlice:
    """Build DerivedSlice from .normalized.json — no re-derivation of types/naming.

    Uses _build_raw_compat() to create a raw-compatible dict so that all
    existing generator functions (gen_projection, _gen_todo_context, etc.)
    work unchanged via ds.raw.
    """
    naming = norm["naming"]
    cmd = norm.get("command", {})
    flags = norm.get("flags", {})
    raw_compat = _build_raw_compat(norm)

    # Build trigger info from processors (same logic as get_trigger_info but from normalized)
    trigger = {}
    is_auto = flags.get("isAutomation", False)
    if is_auto and norm.get("processors"):
        proc = norm["processors"][0]
        trigger_event = ""
        trigger_readmodel = ""
        target_command = ""
        for dep in proc.get("inbound", []):
            if dep.get("elementType") == "EVENT":
                trigger_event = dep.get("title", "")
            elif dep.get("elementType") == "READMODEL":
                trigger_readmodel = dep.get("title", "")
        for dep in proc.get("outbound", []):
            if dep.get("elementType") == "COMMAND":
                target_command = dep.get("title", "")

        trigger = {
            "trigger_event": trigger_event,
            "trigger_readmodel": trigger_readmodel,
            "target_command": target_command,
            "payload_fields": _compat_fields(proc.get("fields", [])),
            "processor_title": proc.get("title", ""),
            "source": proc.get("sourceType", "event"),
            "kafka_topic": f"events.{pascal_case(trigger_event)}" if trigger_event else None,
            "triggers": proc.get("triggers", []),
            "description": proc.get("description", ""),
        }

    has_enrich = False
    if trigger:
        payload_fields = trigger.get("payload_fields", [])
        has_enrich = any(f.get("generated") for f in payload_fields) and bool(trigger.get("description"))

    # Compat: convert normalized fields back to raw shape for generators
    cmd_fields_compat = _compat_fields(cmd.get("fields", []))
    user_compat = _compat_fields(cmd.get("inputFields", []))
    gen_compat = _compat_fields(cmd.get("generatedFields", []))
    events_compat = [_compat_event(e) for e in norm.get("events", [])]
    specs_compat = [_compat_spec(s) for s in norm.get("specifications", [])]

    # Message type for automation slices
    msg_type = ""
    if trigger:
        if trigger.get("trigger_event"):
            msg_type = pascal_case(trigger["trigger_event"])
        elif trigger.get("trigger_readmodel"):
            rm_name = trigger["trigger_readmodel"].replace("TODO", "").replace("To-Do", "").strip()
            msg_type = pascal_case(rm_name)

    return DerivedSlice(
        raw=raw_compat,
        slice_name=naming.get("commandClassName") or naming.get("sliceName", ""),
        slice_name_camel=naming.get("commandHandlerName") or camel_case(naming.get("sliceName", "")),
        stream=stream_name(norm["slice"]["context"]),
        context=norm["slice"]["context"],
        command=raw_compat["commands"][0] if raw_compat.get("commands") else {},
        command_fields=cmd_fields_compat,
        user_fields=user_compat,
        generated_fields=gen_compat,
        command_field_names={field_name(f["name"]) for f in cmd_fields_compat},
        has_commands=flags.get("hasCommands", False),
        events=events_compat,
        specs=specs_compat,
        has_specs=flags.get("hasSpecs", False),
        predicates=[s.get("predicateName", extract_predicate(_compat_spec(s))) for s in norm.get("specifications", [])],
        is_automation=is_auto,
        trigger_info=trigger,
        message_type=msg_type,
        has_enrichment=has_enrich,
        is_projection=(
            flags.get("isProjection", False)
            # Exclude TODO lists (automation work queues — handled by pg-boss, not Kafka)
            and not any(rm.get("todoList") for rm in raw_compat.get("readmodels", []))
        ),
        backend_prompts=norm.get("backendPrompts", []),
        event_id_map=event_id_map or {},
    )


# ──────────────────────────────────────────────────────────────────────
# Path helpers
# ──────────────────────────────────────────────────────────────────────

class SlicePaths:
    """Computes all file paths for a slice."""

    def __init__(self, root: Path, context: str, slice_name: str, stream: str):
        self.root = root
        self.bc = root / "src" / "BusinessCapabilities" / pascal_case(context)
        self.swimlane = self.bc / "swimlanes" / stream
        self.events_dir = self.swimlane / "events"
        self.views_dir = self.swimlane / "views"
        self.slice_dir = self.bc / "slices" / slice_name
        self.tests_dir = self.slice_dir / "tests"
        self.rest_endpoint_dir = self.bc / "endpoints" / slice_name / "REST"
        self.pgboss_endpoint_dir = self.bc / "endpoints" / slice_name / "pg-boss"
        self.stream_factory = self.swimlane / "index.ts"
        self.views_type = self.views_dir / f"{stream}Views.ts"
        self.routes = self.bc / "endpoints" / "routes.ts"

    def event_file(self, event_name: str) -> Path:
        return self.events_dir / f"{event_name}.ts"

    def view_dir(self, view_name: str) -> Path:
        return self.views_dir / view_name

    def view_state(self, view_name: str) -> Path:
        return self.view_dir(view_name) / "state.ts"

    def view_handlers(self, view_name: str) -> Path:
        return self.view_dir(view_name) / "handlers.ts"

    def view_test(self, view_name: str) -> Path:
        return self.view_dir(view_name) / "view.slice.test.ts"


# ──────────────────────────────────────────────────────────────────────
# Automation / enrichment info helpers
# ──────────────────────────────────────────────────────────────────────

def is_automation_slice(slice_data: dict) -> bool:
    """Detect Pattern 5: automation processor (pg-boss triggered).
    NOTE: Only used by derive_slice() fallback. Prefer ds.is_automation."""
    for proc in slice_data.get("processors", []):
        if proc.get("type") == "AUTOMATION":
            return True
    return False


def get_trigger_info(slice_data: dict) -> dict:
    """Extract trigger event info from automation processor dependencies.

    NOTE: Only used by derive_slice() fallback. The normalized path builds
    trigger info directly in derive_slice_from_normalized().

    Returns: { message_type, payload_fields, target_command, source, kafka_topic,
               trigger_readmodel, trigger_event, processor_title, description }
    """
    for proc in slice_data.get("processors", []):
        if proc.get("type") != "AUTOMATION":
            continue

        trigger_readmodel = None
        trigger_event = None
        target_command = None
        for dep in proc.get("dependencies", []):
            if dep["type"] == "INBOUND" and dep["elementType"] == "READMODEL":
                trigger_readmodel = dep["title"]
            if dep["type"] == "INBOUND" and dep["elementType"] == "EVENT":
                trigger_event = dep["title"]
            if dep["type"] == "OUTBOUND" and dep["elementType"] == "COMMAND":
                target_command = dep["title"]

        # Processor fields = the trigger event payload shape
        payload_fields = proc.get("fields", [])

        # Determine source type and Kafka topic
        # .eventmodel2: INBOUND EVENT + triggers[] → cross-boundary Kafka consumer
        # .eventmodel:  INBOUND READMODEL → same-context outbox trigger
        triggers = proc.get("triggers", [])
        if trigger_event:
            source = "message"
            kafka_topic = f"events.{pascal_case(trigger_event)}"
        else:
            source = "event"
            kafka_topic = None

        # Per-component description (.eventmodel2 pattern)
        description = proc.get("description", "")

        return {
            "trigger_readmodel": trigger_readmodel or "",
            "trigger_event": trigger_event or "",
            "target_command": target_command or "",
            "payload_fields": payload_fields,
            "processor_title": proc.get("title", ""),
            "source": source,
            "kafka_topic": kafka_topic,
            "triggers": triggers,
            "description": description,
        }

    return {}



def get_enrichment_info(slice_data: dict) -> dict:
    """Extract enrichment-relevant data from a processor slice.

    Supports both formats:
    - .eventmodel:  codeGen.backendPrompts[] on the slice
    - .eventmodel2: description on individual AUTOMATION processors
    """
    processors = slice_data.get("processors", [])
    proc = None
    for p in processors:
        if p.get("type") == "AUTOMATION":
            proc = p
            break
    if not proc:
        return {}

    all_fields = proc.get("fields", [])
    input_fields, enriched_fields = split_fields(all_fields)

    # Prompts: try slice-level backendPrompts first, fall back to processor description
    prompts = slice_data.get("codeGen", {}).get("backendPrompts", [])
    if not prompts and proc.get("description"):
        prompts = [proc["description"]]

    # Get outbound target (e.g. the command this enrichment feeds)
    outbound_target = None
    for dep in proc.get("dependencies", []):
        if dep.get("type") == "OUTBOUND":
            outbound_target = dep.get("title", "")

    return {
        "input_fields": input_fields,
        "enriched_fields": enriched_fields,
        "prompts": prompts,
        "outbound_target": outbound_target,
        "processor_title": proc.get("title", ""),
        "description": proc.get("description", ""),
    }


def build_event_id_map(root: Path, context: str) -> dict[str, str]:
    """Build a map of event ID → registered event name by scanning all slice.json files.

    The spec.given[].linkedId points to an event in another slice.
    This function scans all slices to build: { eventId: "FundsDepositApproved" }
    so we can resolve given event titles to their actual registered names.
    """
    id_map = {}
    slices_dir = root / ".eventmodel" / ".slices" / context
    if not slices_dir.exists():
        return id_map
    for slice_json in slices_dir.rglob("slice.json"):
        with open(slice_json) as f:
            sd = json.load(f)
        for event in sd.get("events", []):
            eid = str(event.get("id", ""))
            en = event_name_from_title(event["title"], "")
            if eid:
                id_map[eid] = en
    return id_map


def resolve_given_event_name(given: dict, event_id_map: dict[str, str]) -> str:
    """Resolve a spec.given event to its actual registered event name.

    Uses linkedId to find the real event name. Falls back to title if no match.
    """
    linked_id = str(given.get("linkedId", ""))
    if linked_id and linked_id in event_id_map:
        return event_id_map[linked_id]
    return event_name_from_title(given["title"], "")


def _find_event_by_title(events: list[dict], title: str) -> dict | None:
    """Find an event definition by title."""
    for e in events:
        if e["title"] == title:
            return e
    return None


# ──────────────────────────────────────────────────────────────────────
# Renderers — event / command / gwts / command handler
# ──────────────────────────────────────────────────────────────────────

def gen_event_interface(event: dict) -> str:
    """Generate event interface file content."""
    name = event_name_from_title(event["title"], "")
    iface = interface_name(name)
    fields = event.get("fields", [])

    lines = [f"export interface {iface} {{"]
    for f in fields:
        lines.append(field_ts_decl(f))
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def gen_command(ds: DerivedSlice) -> str:
    """Generate command.ts content.

    ALL fields are included in the interface — including generated: true fields.
    Generated fields are part of the command type; they're only computed at the
    REST/pg-boss endpoint layer, not excluded from the TS interface.
    """
    lines = [
        'import type { ICommand } from "#abstractions/commands/ICommand.js";',
        "",
        f"export interface {ds.slice_name} extends ICommand {{",
        f'  readonly commandType: "{ds.slice_name}";',
    ]
    for f in ds.command_fields:
        lines.append(field_ts_decl(f))
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def gen_gwts(ds: DerivedSlice) -> str:
    """Generate gwts.ts with predicate stubs."""
    view_state_type = f"SliceState{ds.slice_name}ViewState"

    lines = [
        f'import type {{ {ds.slice_name} }} from "./command.js";',
        f'import type {{ {view_state_type} }} from "#BusinessCapabilities/{ds.context}/swimlanes/{ds.stream}/views/SliceState{ds.slice_name}/state.js";',
        "",
        "/**",
        " * Named spec predicates derived from the event model's GWT specifications.",
        " * Each function maps 1:1 to a named spec in the event model diagram.",
        " */",
        "",
    ]

    for spec in ds.specs:
        pred_name = extract_predicate(spec)

        title = spec.get("title", "")
        then_events = [t["title"] for t in spec.get("then", [])]
        then_str = ", ".join(then_events) if then_events else "no events (idempotent)"

        # Collect given fields and when fields for hint
        given_fields_hint = []
        for g in spec.get("given", []):
            for f in g.get("fields", []):
                fn = field_name(f["name"])
                if fn not in given_fields_hint:
                    given_fields_hint.append(fn)
        when_fields_hint = [field_name(f["name"]) for f in spec.get("when", [{}])[0].get("fields", [])]

        lines.append("/**")
        lines.append(f" * {title}")
        lines.append(f" * GIVEN state fields: {', '.join(given_fields_hint) if given_fields_hint else 'none'}")
        lines.append(f" * WHEN command fields: {', '.join(when_fields_hint) if when_fields_hint else 'all'}")
        lines.append(f" * THEN: {then_str}")
        lines.append(" */")
        view_state_type = f"SliceState{ds.slice_name}ViewState"
        lines.append(f"export const {pred_name} = (state: {view_state_type}, command: {ds.slice_name}): boolean =>")
        lines.append(f"  false; // TODO: return boolean comparing state.{given_fields_hint[0] if given_fields_hint else 'field'} vs command.{when_fields_hint[0] if when_fields_hint else 'field'}")
        lines.append("")

    return "\n".join(lines)


def gen_command_handler(ds: DerivedSlice) -> str:
    """Generate commandHandler.ts with TODO body."""
    lines = [
        f'import type {{ CommandHandler }} from "#abstractions/commands/commandHandler.js";',
        f'import type {{ {ds.slice_name} }} from "./command.js";',
        f'import type {{ {ds.stream}StreamType }} from "#BusinessCapabilities/{ds.context}/swimlanes/{ds.stream}/index.js";',
    ]

    if ds.has_specs:
        pred_imports = ", ".join(p for p in ds.predicates) if ds.predicates else ""
        if pred_imports:
            lines.append(f'import {{ {pred_imports} }} from "./gwts.js";')

    lines.extend([
        "",
        "/**",
        f" * Pure command handler for the {ds.slice_name} command.",
        " * ONLY appends events — no I/O, no fetching, no returning values.",
        " */",
        f"export const handle{ds.slice_name}: CommandHandler<",
        f"  {ds.stream}StreamType,",
        f"  {ds.slice_name}",
        "> = (stream, command) => {",
    ])

    if ds.has_specs:
        # Destructure state fields from the view
        seen = set()
        state_fields = []
        for spec in ds.specs:
            for given in spec.get("given", []):
                for f in given.get("fields", []):
                    fn = field_name(f["name"])
                    if fn not in seen:
                        seen.add(fn)
                        state_fields.append(fn)
        if state_fields:
            destructure = ", ".join(state_fields)
            lines.append(f"  const {{ {destructure} }} = stream.views.SliceState{ds.slice_name};")
            lines.append("")

    # Generate if/else structure from specs
    if ds.specs:
        for i, spec in enumerate(ds.specs):
            pred_name = extract_predicate(spec)
            then_events = spec.get("then", [])
            keyword = "if" if i == 0 else "} else if"

            lines.append(f"  {keyword} ({pred_name}(stream.views.SliceState{ds.slice_name}, command)) {{")

            if not then_events:
                lines.append("    // Empty then[] — idempotent no-op, append no events")
                lines.append("    return;")
            else:
                for te in then_events:
                    en = event_name_from_title(te["title"], "")
                    lines.append(f"    stream.appendEvent{en}({{")
                    full_event = _find_event_by_title(ds.events, te["title"])
                    event_fields = full_event.get("fields", []) if full_event else te.get("fields", [])
                    for f in event_fields:
                        lines.append(map_event_field_line(f, ds.command_field_names, "      "))
                    lines.append(f"    }});")

        # Default (happy) path
        lines.append("  } else {")
        spec_event_titles = set()
        for spec in ds.specs:
            for te in spec.get("then", []):
                spec_event_titles.add(te["title"])

        default_events = [e for e in ds.events if e["title"] not in spec_event_titles]
        if not default_events:
            default_events = ds.events[:1]

        for de in default_events:
            en = event_name_from_title(de["title"], "")
            lines.append(f"    stream.appendEvent{en}({{")
            for f in de.get("fields", []):
                lines.append(map_event_field_line(f, ds.command_field_names, "      "))
            lines.append(f"    }});")
        lines.append("  }")
    else:
        # No specs — single event, simple flow. Map all event fields from command.
        if ds.events:
            en = event_name_from_title(ds.events[0]["title"], "")
            lines.append(f"  stream.appendEvent{en}({{")
            for f in ds.events[0].get("fields", []):
                lines.append(map_event_field_line(f, ds.command_field_names, "    "))
            lines.append(f"  }});")

    lines.append("};")
    lines.append("")
    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────────────
# Renderers — adapter / REST endpoint / pg-boss endpoint
# ──────────────────────────────────────────────────────────────────────

def gen_adapter(ds: DerivedSlice) -> str:
    """Generate adapter.ts."""
    # Determine stream ID field from aggregate
    # Priority: idAttribute > first non-generated UUID > first generated UUID > default
    aggregate = ds.command.get("aggregate", "")
    id_field = "account"
    first_generated_uuid = None
    for f in ds.command.get("fields", []):
        if f.get("idAttribute"):
            id_field = field_name(f["name"])
            first_generated_uuid = None  # signal we found it
            break
        if f.get("type") == "UUID" and not f.get("generated"):
            id_field = field_name(f["name"])
            first_generated_uuid = None
            break
        if f.get("type") == "UUID" and f.get("generated") and first_generated_uuid is None:
            first_generated_uuid = field_name(f["name"])
    if first_generated_uuid is not None:
        id_field = first_generated_uuid

    return f'''import type {{ {ds.slice_name} }} from "./command.js";
import {{ handle{ds.slice_name} }} from "./commandHandler.js";
import {{ CommandHandlerOrchestratorFactory }} from "#abstractions/commands/CommandHandlerOrchestratorFactory.js";
import type {{ CommandHandlerOrchestrator }} from "#abstractions/commands/commandHandler.js";
import {ds.stream}StreamFactory from "#BusinessCapabilities/{ds.context}/swimlanes/{ds.stream}/index.js";
import type {{ IEvDbStorageAdapter }} from "@eventualize/core/adapters/IEvDbStorageAdapter";

export function create{ds.slice_name}Adapter(storageAdapter: IEvDbStorageAdapter): CommandHandlerOrchestrator<{ds.slice_name}> {{
  return CommandHandlerOrchestratorFactory.create(
    storageAdapter,
    {ds.stream}StreamFactory,
    (command: {ds.slice_name}) => command.{id_field},
    handle{ds.slice_name},
  );
}}
'''


def _zod_field(f: dict) -> str:
    """Map a field to its Zod schema validator."""
    ft = f.get("type", "String")
    optional = f.get("optional", False)

    if ft in ("Double", "Integer", "Int", "Decimal", "Long"):
        base = "z.number()"
    elif ft == "Boolean":
        base = "z.boolean()"
    elif ft in ("DateTime", "Date"):
        base = "z.coerce.date()"
    else:
        # String / UUID
        base = "z.string().min(1)" if not optional else "z.string()"

    if optional:
        base += ".optional()"
    return base


def gen_zod_schema(ds: DerivedSlice) -> str:
    """Generate command.schema.ts with Zod validation schema for user-facing fields."""
    lines = [
        'import { z } from "zod";',
        "",
        f"export const {ds.slice_name}Schema = z.object({{",
    ]
    for f in ds.user_fields:
        fn = field_name(f["name"])
        lines.append(f"  {fn}: {_zod_field(f)},")
    lines.extend([
        "});",
        "",
        f"export type {ds.slice_name}Input = z.infer<typeof {ds.slice_name}Schema>;",
        "",
    ])
    return "\n".join(lines)


def gen_rest_endpoint(ds: DerivedSlice) -> str:
    """Generate REST endpoint index.ts with Zod validation."""
    lines = [
        'import type { Request, Response } from "express";',
        'import { randomUUID } from "node:crypto";',
        f'import {{ create{ds.slice_name}Adapter }} from "#BusinessCapabilities/{ds.context}/slices/{ds.slice_name}/adapter.js";',
        'import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";',
        f'import {{ {ds.slice_name}Schema }} from "../../../slices/{ds.slice_name}/command.schema.js";',
        "",
        f"export const create{ds.slice_name}RestAdapter = (storageAdapter: IEvDbStorageAdapter) => {{",
        f"  const {ds.slice_name_camel} = create{ds.slice_name}Adapter(storageAdapter);",
        "",
        "  return async (req: Request, res: Response) => {",
        "    try {",
        f"      const parsed = {ds.slice_name}Schema.safeParse(req.body);",
        "      if (!parsed.success) {",
        '        res.status(400).json({ error: parsed.error.issues });',
        "        return;",
        "      }",
        "",
        "      const command = {",
        f'        commandType: "{ds.slice_name}" as const,',
        "        ...parsed.data,",
    ]

    for f in ds.generated_fields:
        fn = field_name(f["name"])
        ft = f.get("type", "String")
        if ft in ("DateTime", "Date"):
            lines.append(f"        {fn}: new Date(),")
        elif ft == "UUID":
            lines.append(f"        {fn}: randomUUID(),")
        elif ft in ("Double", "Integer", "Int", "Decimal"):
            lines.append(f"        {fn}: 0, // TODO: compute generated field")
        else:
            lines.append(f'        {fn}: "", // TODO: compute generated field')

    lines.extend([
        "      };",
        "",
        f"      const result = await {ds.slice_name_camel}(command);",
        "",
        "      res.json({",
        "        streamId: result.streamId,",
        "        emittedEventTypes: result.events.map(e => e.eventType),",
        "      });",
        "    } catch (err: unknown) {",
        "      const message = err instanceof Error ? err.message : String(err);",
        '      if (message === "OPTIMISTIC_CONCURRENCY_VIOLATION") {',
        '        res.status(409).json({ error: "Conflict: stream was modified concurrently" });',
        "        return;",
        "      }",
        f'      console.error("POST /{kebab_case(ds.slice_name)} error:", err);',
        "      res.status(500).json({ error: message });",
        "    }",
        "  };",
        "};",
        "",
    ])
    return "\n".join(lines)


def gen_rest_behaviour_test(ds: DerivedSlice) -> str:
    """Generate behaviour.test.ts — HTTP-level test for a REST endpoint using supertest."""
    route_path = kebab_case(ds.slice_name)
    context_pascal = pascal_case(ds.context)
    base_path = f"/api/{kebab_case(context_pascal)}"
    full_path = f"{base_path}/{route_path}"

    # Required fields (same logic as gen_rest_endpoint)
    required = []
    for f in ds.user_fields:
        fn = field_name(f["name"])
        if f.get("type") == "UUID" or fn == "account":
            required.append(fn)
    if not required and ds.user_fields:
        required = [field_name(ds.user_fields[0]["name"])]

    lines = [
        'import * as assert from "node:assert";',
        'import { test, describe } from "node:test";',
        'import express from "express";',
        'import request from "supertest";',
        f'import {{ routeConfig }} from "#BusinessCapabilities/{ds.context}/endpoints/routes.js";',
        'import InMemoryStorageAdapter from "../../../../../tests/InMemoryStorageAdapter.js";',
        "",
        "function createTestApp() {",
        "  const adapter = new InMemoryStorageAdapter();",
        "  const app = express();",
        "  app.use(express.json());",
        "  app.use(routeConfig.basePath, routeConfig.createRouter(adapter));",
        "  return app;",
        "}",
        "",
        f'describe("{ds.slice_name} — Behaviour Tests", () => {{',
    ]

    # Test 1: Valid request returns 200
    lines.append(f'  test("POST {full_path} with valid payload returns 200", async () => {{')
    lines.append("    const app = createTestApp();")
    lines.append("")
    lines.append("    const res = await request(app)")
    lines.append(f'      .post("{full_path}")')
    lines.append("      .send({")
    for f in ds.user_fields:
        fn = field_name(f["name"])
        lines.append(f"        {fn}: {_format_example(f)},")
    lines.append("      });")
    lines.append("")
    lines.append("    assert.strictEqual(res.status, 200);")
    lines.append('    assert.ok(res.body.streamId, "Response should include streamId");')
    lines.append('    assert.ok(Array.isArray(res.body.emittedEventTypes), "Response should include emittedEventTypes");')
    lines.append("  });")
    lines.append("")

    # Test 2: Missing required fields returns 400
    if required:
        lines.append(f'  test("POST {full_path} with missing required fields returns 400", async () => {{')
        lines.append("    const app = createTestApp();")
        lines.append("")
        lines.append("    const res = await request(app)")
        lines.append(f'      .post("{full_path}")')

        # Send payload with required fields removed
        non_required = [f for f in ds.user_fields if field_name(f["name"]) not in required]
        if non_required:
            lines.append("      .send({")
            for f in non_required[:2]:
                fn = field_name(f["name"])
                lines.append(f"        {fn}: {_format_example(f)},")
            lines.append("      });")
        else:
            lines.append("      .send({});")

        lines.append("")
        lines.append("    assert.strictEqual(res.status, 400);")
        lines.append('    assert.ok(res.body.error, "Response should include error message");')
        lines.append("  });")
        lines.append("")

    lines.append("});")
    lines.append("")
    return "\n".join(lines)


def gen_pgboss_endpoint(ds: DerivedSlice) -> str:
    """Generate pg-boss automation endpoint index.ts.

    Supports both delivery patterns:
    - source: "event"   → same-context, outbox trigger (INBOUND READMODEL)
    - source: "message" → cross-boundary, Kafka CDC (INBOUND EVENT)
    """
    trigger = ds.trigger_info
    payload_fields = trigger.get("payload_fields", [])
    source = trigger.get("source", "event")
    kafka_topic = trigger.get("kafka_topic")
    message_type = ds.message_type

    # Build payload interface fields (only non-generated = what comes from the trigger event)
    input_fields = [f for f in payload_fields if not f.get("generated")]
    payload_lines = []
    date_fields = []
    for f in input_fields:
        payload_lines.append(field_ts_decl(f, pgboss_payload=True))
        if f.get("type") in ("DateTime", "Date"):
            date_fields.append(field_name(f["name"]))

    # Build command mapping — match processor fields to command fields
    # Build set of enriched field names from the processor (generated: true on processor fields)
    enriched_field_names = {field_name(pf["name"]) for pf in payload_fields if pf.get("generated")}

    map_lines = []
    map_lines.append(f'    commandType: "{ds.slice_name}" as const,')
    for f in ds.command_fields:
        fn = field_name(f["name"])
        ft = f.get("type", "String")
        if ds.has_enrichment and fn in enriched_field_names:
            # Field comes from the enrichment output
            map_lines.append(f"    {fn}: enriched.{fn},")
        elif f.get("generated"):
            if ft == "DateTime":
                map_lines.append(f"    {fn}: new Date(),")
            elif ft == "UUID":
                map_lines.append(f'    {fn}: randomUUID(),')
            elif ft in ("Double", "Integer", "Int", "Decimal"):
                map_lines.append(f"    {fn}: 0, // TODO: compute generated field")
            else:
                map_lines.append(f'    {fn}: "", // TODO: compute generated field')
        else:
            # Check if field exists in processor payload
            proc_field_names = {field_name(pf["name"]) for pf in payload_fields}
            if fn in proc_field_names:
                if ft in ("DateTime", "Date"):
                    map_lines.append(f"    {fn}: new Date(payload.{fn}),")
                else:
                    map_lines.append(f"    {fn}: payload.{fn},")
            else:
                map_lines.append(f'    {fn}: "", // TODO: not in trigger payload')

    payload_interface_name = f"{message_type}Payload"

    # Imports
    lines = [
        f'import {{ defineAutomationEndpoint }} from "#abstractions/endpoints/defineAutomationEndpoint.js";',
        f'import {{ create{ds.slice_name}Adapter }} from "#BusinessCapabilities/{ds.context}/slices/{ds.slice_name}/adapter.js";',
    ]
    if ds.has_enrichment:
        lines.append(f'import {{ enrich }} from "../enrichment.js";')
    lines.append("")

    # Payload interface
    lines.append(f"interface {payload_interface_name} {{")
    lines.extend(payload_lines)
    lines.extend([
        "}",
        "",
    ])

    # Worker definition
    lines.append("const worker = defineAutomationEndpoint({")
    lines.append(f'  source: "{source}",')
    lines.append(f'  messageType: "{message_type}",')
    if kafka_topic and source == "message":
        lines.append(f'  kafkaTopic: "{kafka_topic}",')
    lines.append(f'  handlerName: "{ds.slice_name}",')
    lines.append(f"  createAdapter: create{ds.slice_name}Adapter,")

    # Idempotency key — use session or transactionId if available
    id_key_field = None
    for f in input_fields:
        fn = field_name(f["name"])
        if fn in ("transactionId", "session"):
            id_key_field = fn
            break
    if id_key_field:
        lines.append(f"  getIdempotencyKey: (payload: {payload_interface_name}) => payload.{id_key_field},")

    # Map payload to command
    if ds.has_enrichment:
        lines.append(f"  mapPayloadToCommand: async (payload: {payload_interface_name}) => {{")
        if date_fields:
            coerce_parts = ", ".join(f"{fn}: new Date(payload.{fn})" for fn in date_fields)
            lines.append(f"    const coerced = {{ ...payload, {coerce_parts} }};")
            lines.append(f"    const enriched = await enrich(coerced);")
        else:
            lines.append(f"    const enriched = await enrich(payload);")
        lines.append(f"    return {{")
        lines.extend(map_lines)
        lines.append(f"    }};")
        lines.append(f"  }},")
    else:
        lines.append(f"  mapPayloadToCommand: (payload: {payload_interface_name}) => ({{")
        lines.extend(map_lines)
        lines.append("  }),")

    lines.extend([
        "});",
        "",
        "export const endpointIdentity = worker.endpointIdentity;",
        f"export const create{message_type}Worker = worker.create;",
        "",
    ])
    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────────────
# Renderers — enrichment
# ──────────────────────────────────────────────────────────────────────

def gen_enrichment(ds: DerivedSlice) -> str:
    """Generate enrichment.ts skeleton with input/output interfaces and a TODO body."""
    info = get_enrichment_info(ds.raw)
    input_fields = info.get("input_fields", [])
    enriched_fields = info.get("enriched_fields", [])

    # Build input interface
    input_lines = [f"export interface {ds.slice_name}EnrichmentInput {{"]
    for f in input_fields:
        input_lines.append(field_ts_decl(f))
    input_lines.append("}")

    # Build output interface (extends input + enriched fields)
    output_lines = [f"export interface {ds.slice_name}EnrichmentOutput extends {ds.slice_name}EnrichmentInput {{"]
    for f in enriched_fields:
        output_lines.append(field_ts_decl(f))
    output_lines.append("}")

    # Function skeleton with TODO
    lines = [
        *input_lines,
        "",
        *output_lines,
        "",
        f"export async function enrich(input: {ds.slice_name}EnrichmentInput): Promise<{ds.slice_name}EnrichmentOutput> {{",
        "  // TODO: implement enrichment logic — see TODO_CONTEXT.md for backendPrompts instructions",
        "  return {",
        "    ...input,",
    ]
    for f in enriched_fields:
        fn = field_name(f["name"])
        ft = f.get("type", "String")
        if ft in ("Double", "Integer", "Int", "Decimal", "Float"):
            lines.append(f"    {fn}: 0, // TODO: compute enriched field")
        elif ft in ("DateTime", "Date"):
            lines.append(f"    {fn}: new Date(), // TODO: compute enriched field")
        else:
            lines.append(f'    {fn}: "", // TODO: compute enriched field')
    lines.extend([
        "  };",
        "}",
        "",
    ])
    return "\n".join(lines)


def gen_enrichment_test(ds: DerivedSlice) -> str:
    """Generate enrichment.test.ts skeleton for an enrichment processor."""
    info = get_enrichment_info(ds.raw)
    input_fields = info.get("input_fields", [])
    enriched_fields = info.get("enriched_fields", [])

    # Build sample input
    input_entries = []
    for f in input_fields:
        fn = field_name(f["name"])
        example = f.get("example", "")
        ft = f.get("type", "String")
        if ft in ("Double", "Integer", "Int", "Decimal", "Float"):
            input_entries.append(f"    {fn}: {example or '0'},")
        else:
            input_entries.append(f'    {fn}: "{example or "test"}",')

    # Build enriched field checks
    check_lines = []
    for f in enriched_fields:
        fn = field_name(f["name"])
        ft = f.get("type", "String")
        check_lines.append(ts_type_check_assertion(fn, ft, "result"))

    lines = [
        'import { describe, it } from "node:test";',
        'import assert from "node:assert/strict";',
        f'import {{ enrich }} from "../enrichment.js";',
        "",
        f'describe("{ds.slice_name} Enrichment", () => {{',
        f'  it("enriches input with computed fields", async () => {{',
        "    const input = {",
        *input_entries,
        "    };",
        "",
        "    const result = await enrich(input);",
        "",
        "    // Verify input fields are passed through",
    ]
    for f in input_fields:
        fn = field_name(f["name"])
        lines.append(f"    assert.strictEqual(result.{fn}, input.{fn});")
    lines.append("")
    lines.append("    // Verify enriched fields are populated")
    lines.extend(check_lines)
    lines.extend([
        "  });",
        "});",
        "",
    ])
    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────────────
# Renderers — tests
# ──────────────────────────────────────────────────────────────────────

def gen_automation_endpoint_test(ds: DerivedSlice) -> str:
    """Generate automation endpoint test — identity check only."""
    source = ds.trigger_info.get("source", "event")
    message_type = ds.message_type

    lines = [
        'import { describe, it } from "node:test";',
        'import assert from "node:assert/strict";',
        f'import {{ endpointIdentity }} from "../pg-boss/index.js";',
        "",
        f'describe("{ds.slice_name} Automation Endpoint", () => {{',
        f'  it("has correct endpoint identity", () => {{',
        f'    assert.strictEqual(endpointIdentity.source, "{source}");',
        f'    assert.strictEqual(endpointIdentity.messageType, "{message_type}");',
        f'    assert.strictEqual(endpointIdentity.handlerName, "{ds.slice_name}");',
        f'    assert.strictEqual(endpointIdentity.queueName, "{source}.{message_type}.{ds.slice_name}");',
        "  });",
        "});",
        "",
    ]
    return "\n".join(lines)


def gen_automation_slice_test(ds: DerivedSlice) -> str:
    """Generate command.slice.test.ts for automation slices.

    Tests the full slice pipeline from the Kafka payload perspective:
      payload → enrich() → build command → command handler → events

    This is different from standard slice tests which start from the command.
    Automation slice tests start from the raw payload (what Kafka delivers).
    """
    trigger = ds.trigger_info
    payload_fields = trigger.get("payload_fields", [])
    input_fields = [f for f in payload_fields if not f.get("generated")]
    enriched_field_names = {field_name(pf["name"]) for pf in payload_fields if pf.get("generated")}

    # Build sample payload entries (input fields only — what arrives from Kafka)
    payload_entries = []
    for f in input_fields:
        fn = field_name(f["name"])
        payload_entries.append(f"    {fn}: {_format_example(f)},")

    # Build command mapping lines (payload fields + enriched fields)
    cmd_mapping = []
    cmd_mapping.append(f'    commandType: "{ds.slice_name}" as const,')
    for f in ds.command_fields:
        fn = field_name(f["name"])
        if ds.has_enrichment and fn in enriched_field_names:
            cmd_mapping.append(f"    {fn}: enriched.{fn},")
        else:
            proc_field_names = {field_name(pf["name"]) for pf in payload_fields}
            if fn in proc_field_names:
                cmd_mapping.append(f"    {fn}: payload.{fn},")
            else:
                cmd_mapping.append(f"    {fn}: undefined as any, // TODO: map from payload or enriched")

    # Build expected event entries
    event_field_entries = []
    if ds.events:
        for f in ds.events[0].get("fields", []):
            fn = field_name(f["name"])
            event_field_entries.append(f"          {fn}: command.{fn},")

    # Imports
    lines = [
        'import { test, describe } from "node:test";',
    ]
    if ds.has_enrichment:
        lines.append('import assert from "node:assert/strict";')
    lines.extend([
        f'import type {{ {ds.slice_name} }} from "../command.js";',
        f'import {{ handle{ds.slice_name} }} from "../commandHandler.js";',
        f'import {{ SliceTester, type TestEvent }} from "#abstractions/slices/SliceTester.js";',
        f'import {ds.stream}StreamFactory from "#BusinessCapabilities/{ds.context}/swimlanes/{ds.stream}/index.js";',
    ])
    if ds.has_enrichment:
        lines.append(f'import {{ enrich }} from "#BusinessCapabilities/{ds.context}/endpoints/{ds.slice_name}/enrichment.js";')
    lines.extend(["", f'describe("{ds.slice_name} Slice - Unit Tests", () => {{', ""])

    # Main test: payload → enrich → command → events
    lines.append(f'  test("automation: payload → enrich → command → event", async () => {{')
    lines.append("    // What arrives from Kafka")
    lines.append("    const payload = {")
    lines.extend(payload_entries)
    lines.append("    };")
    lines.append("")

    if ds.has_enrichment:
        lines.append("    // Enrichment step (same as the automation processor does)")
        lines.append("    const enriched = await enrich(payload);")
        lines.append("")

    lines.append(f"    // Build command (same mapping as pg-boss endpoint)")
    lines.append(f"    const command: {ds.slice_name} = {{")
    lines.extend(cmd_mapping)
    lines.append("    };")
    lines.append("")

    # Expected events
    if ds.events:
        en = event_name_from_title(ds.events[0]["title"], "")
        lines.append("    const expectedEvents: TestEvent[] = [")
        lines.append("      {")
        lines.append(f'        eventType: "{en}",')
        lines.append("        payload: {")
        lines.extend(event_field_entries)
        lines.append("        },")
        lines.append("      },")
        lines.append("    ];")
    else:
        lines.append("    const expectedEvents: TestEvent[] = [];")

    lines.extend([
        "",
        f"    return SliceTester.testCommandHandler(",
        f"      handle{ds.slice_name},",
        f"      {ds.stream}StreamFactory,",
        "      [],",
        "      command,",
        "      expectedEvents,",
        "    );",
        "  });",
        "",
    ])

    if ds.has_enrichment:
        # Additional test: verify enrichment produces expected types
        lines.append(f'  test("enrichment produces valid enriched fields", async () => {{')
        lines.append("    const payload = {")
        lines.extend(payload_entries)
        lines.append("    };")
        lines.append("")
        lines.append("    const enriched = await enrich(payload);")
        lines.append("")
        lines.append("    // Input fields passed through")
        for f in input_fields:
            fn = field_name(f["name"])
            lines.append(f"    assert.strictEqual(enriched.{fn}, payload.{fn});")
        lines.append("")
        lines.append("    // Enriched fields populated")
        for f in payload_fields:
            if f.get("generated"):
                fn = field_name(f["name"])
                ft = f.get("type", "String")
                lines.append(ts_type_check_assertion(fn, ft, "enriched"))
        lines.extend([
            "  });",
            "",
        ])

    lines.append("});")
    lines.append("")
    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────────────
# Renderers — views
# ──────────────────────────────────────────────────────────────────────

def gen_view_state(ds: DerivedSlice) -> str:
    """Generate SliceState view state.ts.

    Derives state shape from spec.given[] event fields — no domain assumptions.
    """
    view_name = f"SliceState{ds.slice_name}"

    # Collect all fields from given events (deduplicated, preserving order)
    seen = set()
    given_fields = []
    for spec in ds.specs:
        for given in spec.get("given", []):
            for f in given.get("fields", []):
                fn = field_name(f["name"])
                if fn not in seen:
                    seen.add(fn)
                    given_fields.append((fn, f.get("type", "String")))

    lines = [
        f"export type {view_name}ViewState = {{",
    ]

    defaults = []
    for fn, ft in given_fields:
        tt = ts_type(ft)
        lines.append(f"  readonly {fn}: {tt};")
        # Default values by type
        if tt == "number":
            defaults.append(f"  {fn}: 0,")
        elif tt == "boolean":
            defaults.append(f"  {fn}: false,")
        elif tt == "Date":
            defaults.append(f"  {fn}: new Date(0),")
        else:
            defaults.append(f'  {fn}: "",')

    # If no given events, add a minimal flag so the view is still valid
    if not given_fields:
        lines.append("  readonly initialized: boolean;")
        defaults.append("  initialized: false,")

    lines.extend([
        "}",
        "",
        f'export const viewName = "{view_name}" as const;',
        f"export const defaultState: {view_name}ViewState = {{",
    ])
    lines.extend(defaults)
    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def gen_view_handlers(ds: DerivedSlice) -> str:
    """Generate SliceState view handlers.ts.

    Each given event type gets a handler that spreads event fields into state.
    No domain assumptions — just maps event fields to state fields.
    """
    view_name = f"SliceState{ds.slice_name}"

    # Collect given event types (deduplicated), resolving via linkedId
    given_events = {}
    for spec in ds.specs:
        for given in spec.get("given", []):
            en = resolve_given_event_name(given, ds.event_id_map)
            if en not in given_events:
                given_events[en] = given

    lines = []
    for en in given_events:
        iface = interface_name(en)
        lines.append(f'import type {{ {iface} }} from "../../events/{en}.js";')

    lines.append(f'import type {{ {view_name}ViewState }} from "./state.js";')
    lines.append("")
    lines.append("export const handlers = {")

    for en, given in given_events.items():
        iface = interface_name(en)
        given_fields = given.get("fields", [])

        lines.append(f"  {en}: (")
        lines.append(f"    state: {view_name}ViewState,")
        lines.append(f"    event: {iface},")
        lines.append(f"  ): {view_name}ViewState => ({{")
        lines.append(f"    ...state,")
        for f in given_fields:
            fn = field_name(f["name"])
            lines.append(f"    {fn}: event.{fn},")
        lines.append(f"  }}),")
        lines.append("")

    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def gen_view_test(ds: DerivedSlice) -> str:
    """Generate view.slice.test.ts for SliceState view."""
    view_name = f"SliceState{ds.slice_name}"
    state_type = f"{view_name}ViewState"

    # Collect given event types and their fields
    given_events = {}
    for spec in ds.specs:
        for given in spec.get("given", []):
            en = resolve_given_event_name(given, ds.event_id_map)
            if en not in given_events:
                given_events[en] = given

    # Collect all state fields for 'then' assertions
    state_fields = []
    seen = set()
    for spec in ds.specs:
        for given in spec.get("given", []):
            for f in given.get("fields", []):
                fn = field_name(f["name"])
                if fn not in seen:
                    seen.add(fn)
                    state_fields.append((fn, f))

    # Collect negative event names (events in spec.then that are not given events)
    negative_events = set()
    for spec in ds.specs:
        for te in spec.get("then", []):
            en = event_name_from_title(te["title"], "")
            if en not in given_events:
                negative_events.add(en)

    lines = [
        f'import {{ ViewSliceTester, type ViewConfig }} from "#abstractions/slices/ViewSliceTester.js";',
        f'import {{ handlers }} from "./handlers.js";',
        f'import {{ type {state_type}, viewName, defaultState }} from "./state.js";',
        "",
        f"const {camel_case(view_name)}View: ViewConfig<{state_type}> = {{",
        f"  name: viewName,",
        f"  defaultState,",
        f"  handlers,",
        f"}};",
        "",
        f"ViewSliceTester.run({camel_case(view_name)}View, [",
    ]

    # Scenario 1: single given event mutates state
    if given_events:
        first_en, first_given = next(iter(given_events.items()))
        first_fields = first_given.get("fields", [])
        lines.append("  {")
        lines.append(f'    description: "{first_en} updates state correctly",')
        lines.append("    given: [")
        lines.append("      {")
        lines.append(f'        eventType: "{first_en}",')
        lines.append("        payload: {")
        for f in first_fields:
            fn = field_name(f["name"])
            lines.append(f"          {fn}: {_format_example(f)},")
        lines.append("        },")
        lines.append("      },")
        lines.append("    ],")
        lines.append("    then: {")
        for fn, f in state_fields:
            lines.append(f"      {fn}: {_format_example(f)},")
        lines.append("    },")
        lines.append("  },")

        # Scenario 2: multiple events accumulate
        lines.append("  {")
        lines.append(f'    description: "multiple {first_en} events accumulate correctly",')
        lines.append("    given: [")
        for _ in range(2):
            lines.append("      {")
            lines.append(f'        eventType: "{first_en}",')
            lines.append("        payload: {")
            for f in first_fields:
                fn = field_name(f["name"])
                lines.append(f"          {fn}: {_format_example(f)},")
            lines.append("        },")
            lines.append("      },")
        lines.append("    ],")
        lines.append(f"    // TODO: adjust 'then' — does state overwrite or accumulate?")
        lines.append("    then: {")
        for fn, f in state_fields:
            lines.append(f"      {fn}: {_format_example(f)},")
        lines.append("    },")
        lines.append("  },")

    # Scenario 3: negative/unrelated event does not change state
    if negative_events:
        neg_en = next(iter(negative_events))
        lines.append("  {")
        lines.append(f'    description: "{neg_en} does not change state",')
        lines.append("    given: [")
        lines.append("      {")
        lines.append(f'        eventType: "{neg_en}",')
        lines.append("        payload: {},")
        lines.append("      },")
        lines.append("    ],")
        lines.append("    then: defaultState,")
        lines.append("  },")

    lines.append("]);")
    lines.append("")
    return "\n".join(lines)


def gen_test(ds: DerivedSlice) -> str:
    """Generate command.slice.test.ts."""
    cmd = ds.command

    lines = [
        'import { test, describe } from "node:test";',
        f'import type {{ {ds.slice_name} }} from "../command.js";',
        f'import {{ handle{ds.slice_name} }} from "../commandHandler.js";',
        f'import {{ SliceTester, type TestEvent }} from "#abstractions/slices/SliceTester.js";',
        f'import {ds.stream}StreamFactory from "#BusinessCapabilities/{ds.context}/swimlanes/{ds.stream}/index.js";',
        "",
        f'describe("{ds.slice_name} Slice - Unit Tests", () => {{',
    ]

    # Main flow test — use the spec with fewest given events (happy/success path).
    main_spec = min(ds.specs, key=lambda s: len(s.get("given", []))) if ds.specs else None

    lines.append('  test("main flow", async () => {')

    # Given events
    main_given = main_spec.get("given", []) if main_spec else []
    if main_given:
        lines.append("    const givenEvents: TestEvent[] = [")
        for g in main_given:
            en = event_name_from_title(g["title"], "")
            lines.append(f"      {{")
            lines.append(f'        eventType: "{en}",')
            lines.append(f"        payload: {{")
            for f in g.get("fields", []):
                lines.append(f"          {field_name(f['name'])}: {_format_example(f)},")
            lines.append(f"        }},")
            lines.append(f"      }},")
        lines.append("    ];")
    else:
        lines.append("    const givenEvents: TestEvent[] = [];")

    # Command — use main_spec's when fields if available, else command defaults
    main_when_fields = {}
    if main_spec:
        for f in main_spec.get("when", [{}])[0].get("fields", []):
            main_when_fields[field_name(f["name"])] = f
    lines.append(f"    const command: {ds.slice_name} = {{")
    lines.append(f'      commandType: "{ds.slice_name}",')
    for f in cmd.get("fields", []):
        fn = field_name(f["name"])
        src = main_when_fields.get(fn, f)
        lines.append(f"      {fn}: {_format_example(src)},")
    lines.append("    };")

    # Expected events — use main_spec's then events
    lines.append("    const expectedEvents: TestEvent[] = [")
    main_then = main_spec.get("then", []) if main_spec else []
    for te in main_then:
        en = event_name_from_title(te["title"], "")
        lines.append(f"      {{")
        lines.append(f'        eventType: "{en}",')
        lines.append(f"        payload: {{")
        for f in te.get("fields", []):
            lines.append(f"          {field_name(f['name'])}: {_format_example(f)},")
        lines.append(f"        }},")
        lines.append(f"      }},")
    lines.append("    ];")

    lines.extend([
        "    return SliceTester.testCommandHandler(",
        f"      handle{ds.slice_name},",
        f"      {ds.stream}StreamFactory,",
        "      givenEvents,",
        "      command,",
        "      expectedEvents,",
        "    );",
        "  });",
        "",
    ])

    # Spec tests
    for spec in ds.specs:
        pred_name = extract_predicate(spec)
        spec_title = spec.get("title", pred_name)

        lines.append(f'  test("{spec_title}", async () => {{')

        # Given
        given_list = spec.get("given", [])
        if given_list:
            lines.append("    const givenEvents: TestEvent[] = [")
            for g in given_list:
                en = event_name_from_title(g["title"], "")
                lines.append(f"      {{")
                lines.append(f'        eventType: "{en}",')
                lines.append(f"        payload: {{")
                for f in g.get("fields", []):
                    fn = field_name(f["name"])
                    lines.append(f"          {fn}: {_format_example(f)},")
                lines.append(f"        }},")
                lines.append(f"      }},")
            lines.append("    ];")
        else:
            lines.append("    const givenEvents: TestEvent[] = [];")

        # When
        when_cmd = spec.get("when", [{}])[0]
        lines.append(f"    const command: {ds.slice_name} = {{")
        lines.append(f'      commandType: "{ds.slice_name}",')
        # Use spec when fields if available, otherwise fall back to command fields
        when_fields = when_cmd.get("fields", [])
        cmd_fields = cmd.get("fields", [])

        # Build a map of when field examples
        when_map = {field_name(f["name"]): f for f in when_fields}

        for f in cmd_fields:
            fn = field_name(f["name"])
            ft = f.get("type", "String")
            if fn in when_map:
                lines.append(f"      {fn}: {_format_example(when_map[fn])},")
            elif f.get("generated"):
                if ft == "DateTime":
                    lines.append(f'      {fn}: new Date("2025-01-01T11:00:00Z"),')
                elif ft == "UUID":
                    lines.append(f'      {fn}: "generated-uuid",')
                elif ft in ("Double", "Integer", "Int"):
                    lines.append(f"      {fn}: 0,")
                else:
                    lines.append(f"      {fn}: {_format_example(f)},")
            else:
                lines.append(f"      {fn}: {_format_example(f)},")
        lines.append("    };")

        # Then
        then_events = spec.get("then", [])
        if then_events:
            lines.append("    const expectedEvents: TestEvent[] = [")
            for te in then_events:
                en = event_name_from_title(te["title"], "")
                lines.append(f"      {{")
                lines.append(f'        eventType: "{en}",')
                lines.append(f"        payload: {{")
                for f in te.get("fields", []):
                    fn = field_name(f["name"])
                    lines.append(f"          {fn}: {_format_example(f)},")
                lines.append(f"        }},")
                lines.append(f"      }},")
            lines.append("    ];")
        else:
            lines.append("    const expectedEvents: TestEvent[] = [];")

        lines.extend([
            "    return SliceTester.testCommandHandler(",
            f"      handle{ds.slice_name},",
            f"      {ds.stream}StreamFactory,",
            "      givenEvents,",
            "      command,",
            "      expectedEvents,",
            "    );",
            "  });",
            "",
        ])

    lines.append("});")
    lines.append("")
    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────────────
# Renderers — projections
# ──────────────────────────────────────────────────────────────────────


def gen_event_message(event_name: str, event_iface: str, event_fields: list[dict]) -> str:
    """Generate a message producer file for an event.

    Creates a simple pass-through that writes the event payload to the outbox
    as a CDC message (channel 'default'), making it available to Kafka consumers
    like projections.
    """
    payload_fields = []
    for f in event_fields:
        fn = field_name(f["name"])
        payload_fields.append(f"      {fn}: payload.{fn},")

    return f'''import type {{ {event_iface} }} from "../events/{event_name}.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";

export const {camel_case(event_name)}Messages = (
  payload: Readonly<{event_iface}>,
  _views: unknown,
  metadata: IEvDbEventMetadata,
) => {{
  return [
    EvDbMessage.createFromMetadata(metadata, "{event_name}", {{
{chr(10).join(payload_fields)}
    }}),
  ];
}};
'''


def gen_automation_trigger_message(event_name: str, event_iface: str, event_fields: list[dict],
                                   context: str, automation_slice_name: str) -> str:
    """Generate a message producer for an event that triggers an automation (pg-boss).

    Creates BOTH:
    - pg-boss queue message (routes to the automation worker)
    - CDC message (for projections that also consume this event)
    """
    payload_fields = []
    for f in event_fields:
        fn = field_name(f["name"])
        payload_fields.append(f"      {fn}: payload.{fn},")

    return f'''import type {{ {event_iface} }} from "../events/{event_name}.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import {{ endpointIdentity }} from "#BusinessCapabilities/{context}/endpoints/{automation_slice_name}/pg-boss/index.js";
import {{ createPgBossQueueMessageFromMetadata }} from "#abstractions/endpoints/queueMessage.js";

export const {camel_case(event_name)}Messages = (
  payload: Readonly<{event_iface}>,
  _views: unknown,
  metadata: IEvDbEventMetadata,
) => {{
  return [
    createPgBossQueueMessageFromMetadata(
      [endpointIdentity.queueName],
      metadata,
      "{automation_slice_name}",
      {{
{chr(10).join(payload_fields)}
      }},
    ),
    EvDbMessage.createFromMetadata(metadata, "{event_name}", {{
{chr(10).join(payload_fields)}
    }}),
  ];
}};
'''


def gen_projection(ds: DerivedSlice) -> str:
    """Generate projection index.ts with ProjectionConfig skeleton.

    Creates a ProjectionConfig with handler stubs for each INBOUND event.
    Handler bodies are TODO — AI fills in the SQL logic.
    """
    readmodel = ds.raw["readmodels"][0]
    rm_fields = readmodel.get("fields", [])

    # Find INBOUND events that feed this readmodel
    inbound_events = []
    for dep in readmodel.get("dependencies", []):
        if dep.get("type") == "INBOUND" and dep.get("elementType") == "EVENT":
            inbound_events.append(pascal_case(dep["title"]))

    # Determine projection key from idAttribute fields.
    # Multiple idAttribute fields → composite key (e.g. portfolioId:loanId)
    # Single idAttribute → simple key
    # No idAttribute → first UUID > 'account'
    id_fields = [field_name(f["name"]) for f in rm_fields if f.get("idAttribute")]

    if len(id_fields) > 1:
        # Composite key from multiple idAttribute fields
        parts = ":".join(f"${{p.{fn}}}" for fn in id_fields)
        key_expr = f"`{parts}`"
    elif len(id_fields) == 1:
        key_expr = f"p.{id_fields[0]}"
    else:
        # Fallback: first UUID > 'account'
        key_name = "account"
        for f in rm_fields:
            if f.get("type") == "UUID":
                key_name = field_name(f["name"])
                break
        key_expr = f"p.{key_name}"
        key_expr = f"p.{key_name}"

    # Build payload type for each event
    payload_fields_ts = []
    for f in rm_fields:
        fn = field_name(f["name"])
        ft = ts_type(f.get("type", "String"))
        payload_fields_ts.append(f"  {fn}: {ft};")

    lines = [
        'import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";',
        'import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";',
        "",
        f"type {ds.slice_name}Payload = {{",
        *payload_fields_ts,
        "};",
        "",
        f"export const {ds.slice_name_camel}Slice: ProjectionConfig = {{",
        f'  projectionName: "{ds.slice_name}",',
        "",
        "  mode: { type: ProjectionModeType.Query },",
        "",
        "  handlers: {",
    ]

    for event_name in inbound_events:
        lines.extend([
            f"    {event_name}: (payload, {{ projectionName }}) => {{",
            f"      const p = payload as {ds.slice_name}Payload;",
            f'      const key = {key_expr};',
            "      return [",
            "        {",
            '          sql: `',
            '            INSERT INTO projections (name, key, payload)',
            '            VALUES ($1, $2, $3::jsonb)',
            '            ON CONFLICT (name, key) DO UPDATE',
            '              SET payload = EXCLUDED.payload`,',
            "          params: [",
            "            projectionName,",
            "            key,",
            f"            JSON.stringify(p), // TODO: select specific fields to store",
            "          ],",
            "        },",
            "      ];",
            "    },",
            "",
        ])

    lines.extend([
        "  },",
        "};",
        "",
    ])
    return "\n".join(lines)


def gen_projection_test(ds: DerivedSlice) -> str:
    """Generate projection unit test skeleton (shape checks only)."""
    readmodel = ds.raw["readmodels"][0]
    rm_fields = readmodel.get("fields", [])

    # Find INBOUND events
    inbound_events = []
    for dep in readmodel.get("dependencies", []):
        if dep.get("type") == "INBOUND" and dep.get("elementType") == "EVENT":
            inbound_events.append(pascal_case(dep["title"]))

    # Build sample payload from readmodel fields
    payload_entries = []
    for f in rm_fields:
        fn = field_name(f["name"])
        payload_entries.append(f"      {fn}: {_format_example(f)},")

    lines = [
        'import { describe, it } from "node:test";',
        'import assert from "node:assert/strict";',
        f'import {{ {ds.slice_name_camel}Slice }} from "../index.js";',
        "",
        f'describe("Projection: {ds.slice_name}", () => {{',
        f'  it("has correct projection name", () => {{',
        f'    assert.strictEqual({ds.slice_name_camel}Slice.projectionName, "{ds.slice_name}");',
        "  });",
        "",
    ]

    for event_name in inbound_events:
        lines.extend([
            f'  it("{event_name} handler returns SQL statements", () => {{',
            "    const payload = {",
            *payload_entries,
            "    };",
            f'    const meta = {{ outboxId: "test-id", storedAt: new Date(), projectionName: "{ds.slice_name}" }};',
            f"    const result = {ds.slice_name_camel}Slice.handlers.{event_name}!(payload, meta)!;",
            "",
            "    assert.ok(result.length > 0, 'should have at least one SQL statement');",
            "    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');",
            "    assert.ok(result[0].params.length > 0, 'params should not be empty');",
            "  });",
            "",
        ])

    lines.extend([
        "});",
        "",
    ])
    return "\n".join(lines)


def gen_projection_integration_test(ds: DerivedSlice) -> str:
    """Generate projection integration test skeleton for AI to fill.

    Produces a minimal ProjectionSliceTester.run() structure with TODO
    test cases. The AI fills in event payloads and expected state based
    on the event schema (from TODO_CONTEXT.md) and the readmodel description.

    The scaffold does NOT attempt to generate payloads because:
    - The event fields come from a different slice (upstream event producer)
    - The readmodel fields are the OUTPUT, not the INPUT
    - The scaffold only has access to the current slice's definition

    What the AI fills:
    - Event payload fields (from the inbound event schema)
    - Expected state after one event (initial values)
    - Expected state after two events (accumulation, if spec has description)

    What this catches when the AI fills it correctly:
    - Uncast parameters in jsonb_build_object ($3 without ::text)
    - Wrong accumulation logic (EXCLUDED.payload instead of field-specific SQL)
    - Missing fields in the stored payload
    - SQL syntax errors
    """
    readmodel = ds.raw["readmodels"][0]
    description = readmodel.get("description", "").strip()

    # Find INBOUND events
    inbound_events = []
    for dep in readmodel.get("dependencies", []):
        if dep.get("type") == "INBOUND" and dep.get("elementType") == "EVENT":
            inbound_events.append(pascal_case(dep["title"]))

    if not inbound_events:
        return ""

    event_name = inbound_events[0]

    lines = [
        'import { randomUUID } from "node:crypto";',
        'import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";',
        f'import {{ {ds.slice_name_camel}Slice }} from "./index.js";',
        "",
        f"ProjectionSliceTester.run({ds.slice_name_camel}Slice, [",
        "  {",
        f'    description: "{event_name}: first event creates initial state",',
        "    run: () => {",
        f"      // TODO: create test data and fill expected state",
        f"      // The payload should contain the fields from the {event_name} event,",
        f"      // NOT the readmodel fields. Check the event schema in TODO_CONTEXT.md.",
        f"      // Key should match how the projection handler builds it.",
        "      const key = randomUUID();",
        "      return {",
        "        given: [",
        f'          {{ messageType: "{event_name}", payload: {{',
        f"            // TODO: fill with {event_name} event fields",
        "          } },",
        "        ],",
        "        then: [{ key, expectedState: {",
        "          // TODO: expected stored state after first event",
        "        } }],",
        "      };",
        "    },",
        "  },",
    ]

    # Second test case only if there's aggregation logic to test
    if description:
        desc_short = description[:120].replace('"', "'")
        if len(description) > 120:
            desc_short += "..."
        lines.extend([
            "  {",
            f'    description: "two {event_name} events: fields accumulate correctly",',
            "    run: () => {",
            f"      // Spec: {desc_short}",
            f"      // TODO: send two events with DIFFERENT numeric values,",
            f"      // then assert the accumulated/averaged result.",
            "      const key = randomUUID();",
            "      return {",
            "        given: [",
            f'          {{ messageType: "{event_name}", payload: {{',
            f"            // TODO: first event payload",
            "          } },",
            f'          {{ messageType: "{event_name}", payload: {{',
            f"            // TODO: second event payload (different numbers)",
            "          } },",
            "        ],",
            "        then: [{ key, expectedState: {",
            "          // TODO: expected accumulated state after two events",
            "        } }],",
            "      };",
            "    },",
            "  },",
        ])

    lines.extend([
        "]);",
        "",
    ])
    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────────────
# Patchers — automations / routes / projections registry updaters
# ──────────────────────────────────────────────────────────────────────

def update_context_automations(paths: SlicePaths, slice_data: dict, slice_name: str) -> str:
    """Create or update per-context automations.ts with a side-effect import.

    Each automation endpoint self-registers via defineAutomationEndpoint().
    automations.ts just imports the pg-boss endpoint module to trigger registration.
    Discovery at startup dynamically imports all automations.ts files.
    """
    automations_path = paths.bc / "endpoints" / "automations.ts"
    content = automations_path.read_text() if automations_path.exists() else ""

    import_line = f'import "./{slice_name}/pg-boss/index.js";'

    if import_line in content:
        return content

    if not content:
        return f"""// Side-effect imports — triggers self-registration via defineAutomationEndpoint()
{import_line}
"""

    # Append new import line
    content = content.rstrip("\n") + "\n" + import_line + "\n"
    return content


def update_context_projections(paths: SlicePaths, slice_data: dict, slice_name: str) -> str:
    """Create or update per-context slices/projections.ts.

    Collects all projection slice exports for discovery at startup.
    """
    sn_camel = camel_case(slice_name)
    export_name = f"{sn_camel}Slice"
    projections_path = paths.bc / "slices" / "projections.ts"
    content = projections_path.read_text() if projections_path.exists() else ""

    import_line = f'import {{ {export_name} }} from "./{slice_name}/index.js";'

    if export_name in content:
        return content

    if not content:
        return f'''// Projection slice exports — collected for discovery at startup
{import_line}
import type {{ ProjectionConfig }} from "#abstractions/projections/ProjectionFactory.js";

export const {camel_case(slice_data["context"])}Projections: readonly ProjectionConfig[] = [
  {export_name},
];
'''

    # Add import
    if import_line not in content:
        lines_list = content.split("\n")
        last_import = 0
        for i, line in enumerate(lines_list):
            if line.startswith("import "):
                last_import = i
        lines_list.insert(last_import + 1, import_line)
        content = "\n".join(lines_list)

    # Add to array — insert before closing ];
    entry_line = f"  {export_name},"
    if entry_line not in content:
        content = content.replace("];", f"{entry_line}\n];")

    return content


# ──────────────────────────────────────────────────────────────────────
# Patchers — stream factory / views type updaters
# ──────────────────────────────────────────────────────────────────────

def gen_stream_factory(slice_data: dict) -> str:
    """Generate a minimal stream factory index.ts for a new context."""
    stream = stream_name(slice_data["context"])
    lines = [
        'import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";',
        "",
        f'const {stream}StreamFactory = new StreamFactoryBuilder("{stream}Stream")',
        "  .build();",
        "",
        f"export default {stream}StreamFactory;",
        f"export type {stream}StreamType = typeof {stream}StreamFactory.StreamType;",
        "",
    ]
    return "\n".join(lines)


def update_stream_factory(paths: SlicePaths, slice_data: dict, events: list[dict], view_name: str) -> str:
    """Update stream factory index.ts."""
    sn = slice_name_pascal(slice_data)
    stream = stream_name(slice_data["context"])
    content = paths.stream_factory.read_text() if paths.stream_factory.exists() else ""

    if not content:
        return content

    # Add event imports and registrations
    new_imports = []
    new_events = []
    new_view_imports = []
    new_views = []

    for event in events:
        en = event_name_from_title(event["title"], "")
        iface = interface_name(en)
        import_line = f'import type {{ {iface} }} from "./events/{en}.js";'
        event_line = f'  .withEvent("{en}").asType<{iface}>()'

        if iface not in content:
            new_imports.append(import_line)
        if f'"{en}"' not in content or f'.withEvent("{en}")' not in content:
            new_events.append(event_line)

    if view_name and view_name not in content:
        alias_base = camel_case(view_name)
        new_view_imports.extend([
            f'import {{ defaultState as {alias_base}DefaultState, viewName as {alias_base}ViewName }} from "./views/{view_name}/state.js";',
            f'import {{ handlers as {alias_base}Handlers }} from "./views/{view_name}/handlers.js";',
        ])
        new_views.append(f"  .withView({alias_base}ViewName, {alias_base}DefaultState, {alias_base}Handlers)")

    if not new_imports and not new_events and not new_view_imports and not new_views:
        return content

    # Insert imports before the StreamFactoryBuilder line
    lines = content.split("\n")
    result = []
    builder_idx = None

    for i, line in enumerate(lines):
        if "new StreamFactoryBuilder" in line:
            builder_idx = i
            break

    if builder_idx is None:
        return content

    # Add imports before builder
    result = lines[:builder_idx]
    for imp in new_imports + new_view_imports:
        if imp not in content:
            result.append(imp)

    # Find .build() and insert before it
    remaining = "\n".join(lines[builder_idx:])

    for event_line in new_events:
        # Insert before .build()
        remaining = remaining.replace("  .build();", f"{event_line}\n  .build();", 1)

    for view_line in new_views:
        remaining = remaining.replace("  .build();", f"{view_line}\n  .build();", 1)

    result.append(remaining)
    return "\n".join(result)


def wire_messages_on_stream(paths: SlicePaths, event_names: list[str]) -> str:
    """Add .withMessages() calls and message imports to the stream factory.

    For each event, adds:
      - import { <camel>Messages } from "./messages/<eventName>Messages.js";
      - .withMessages("<EventName>", <camel>Messages) before .build()
    """
    content = paths.stream_factory.read_text() if paths.stream_factory.exists() else ""
    if not content:
        return content

    new_imports = []
    new_messages = []

    for en in event_names:
        msg_var = f"{camel_case(en)}Messages"
        import_line = f'import {{ {msg_var} }} from "./messages/{en}Messages.js";'
        message_line = f'  .withMessages("{en}", {msg_var})'

        if msg_var not in content:
            new_imports.append(import_line)
        if f'.withMessages("{en}"' not in content:
            new_messages.append(message_line)

    if not new_imports and not new_messages:
        return content

    # Insert imports before StreamFactoryBuilder line
    lines = content.split("\n")
    builder_idx = None
    for i, line in enumerate(lines):
        if "new StreamFactoryBuilder" in line:
            builder_idx = i
            break

    if builder_idx is None:
        return content

    result = lines[:builder_idx]
    for imp in new_imports:
        if imp not in content:
            result.append(imp)

    remaining = "\n".join(lines[builder_idx:])
    for msg_line in new_messages:
        remaining = remaining.replace("  .build();", f"{msg_line}\n  .build();", 1)

    result.append(remaining)
    return "\n".join(result)


def update_views_type(paths: SlicePaths, slice_data: dict, view_name: str) -> str:
    """Update or create <Stream>Views.ts."""
    stream = stream_name(slice_data["context"])
    content = paths.views_type.read_text() if paths.views_type.exists() else ""

    if view_name in content:
        return content

    state_type = f"{view_name}ViewState"
    import_line = f'import type {{ {state_type} }} from "./{view_name}/state.js";'
    record_line = f'  Record<"{view_name}", {state_type}>'

    if not content:
        return f"""{import_line}

export type {stream}Views = Readonly<
{record_line}
>;
"""

    # Add import
    if import_line not in content:
        # Insert after last import
        lines = content.split("\n")
        last_import = 0
        for i, line in enumerate(lines):
            if line.startswith("import "):
                last_import = i
        lines.insert(last_import + 1, import_line)
        content = "\n".join(lines)

    # Add record — insert before the closing '>;\n'
    if record_line not in content:
        content = content.replace("\n>;", f" &\n{record_line}\n>;")

    return content


def _build_swagger_properties(fields: list[dict]) -> str:
    """Build OpenAPI properties object string from command fields."""
    props = []
    required = []
    for f in fields:
        if f.get("generated"):
            continue
        name = field_name(f["name"])
        schema = openapi_type(f.get("type", "String"))
        example = f.get("example", "").strip('"').strip("'")
        parts = [f'type: "{schema["type"]}"']
        if "format" in schema:
            parts.append(f'format: "{schema["format"]}"')
        if example:
            if schema["type"] in ("number", "integer"):
                parts.append(f"example: {example}")
            else:
                parts.append(f'example: "{example}"')
        props.append(f"                    {name}: {{ {', '.join(parts)} }},")
        required.append(f'"{name}"')
    return "\n".join(props), ", ".join(required)


def update_routes(paths: SlicePaths, slice_data: dict) -> str:
    """Update routes.ts to register the new endpoint with swagger spec."""
    sn = slice_name_pascal(slice_data)
    context = slice_data["context"]
    content = paths.routes.read_text() if paths.routes.exists() else ""

    adapter_name = f"create{sn}RestAdapter"
    route_path = kebab_case(sn)

    if adapter_name in content:
        return content

    import_line = f'import {{ {adapter_name} }} from "./{sn}/REST/index.js";'

    context_pascal = pascal_case(context)
    base_path = f"/api/{kebab_case(context_pascal)}"
    full_path = f"{base_path}/{route_path}"

    # Build swagger properties from command fields
    commands = slice_data.get("commands", [])
    input_fields = commands[0].get("fields", []) if commands else []
    props_str, required_str = _build_swagger_properties(input_fields)

    swagger_entry = f"""    "{full_path}": {{
      post: {{
        summary: "{sn}",
        tags: ["{context_pascal}"],
        requestBody: {{
          required: true,
          content: {{
            "application/json": {{
              schema: {{
                type: "object",
                required: [{required_str}],
                properties: {{
{props_str}
                }},
              }},
            }},
          }},
        }},
        responses: {{
          "200": {{
            description: "Command executed",
            content: {{
              "application/json": {{
                schema: {{
                  type: "object",
                  properties: {{
                    streamId: {{ type: "string" }},
                    emittedEventTypes: {{ type: "array", items: {{ type: "string" }} }},
                  }},
                }},
              }},
            }},
          }},
          "400": {{ description: "Missing required fields" }},
          "409": {{ description: "Optimistic concurrency violation" }},
        }},
      }},
    }}"""

    if not content:
        return f"""import {{ Router }} from "express";
{import_line}
import type {{ IEvDbStorageAdapter }} from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type {{ RouteConfig }} from "../../../abstractions/endpoints/discoverRoutes.js";

function create{context_pascal}Router(storageAdapter: IEvDbStorageAdapter): Router {{
  const router = Router();

  router.post("/{route_path}", {adapter_name}(storageAdapter));

  return router;
}}

export const routeConfig: RouteConfig = {{
  basePath: "{base_path}",
  createRouter: create{context_pascal}Router,
  swagger: {{
{swagger_entry},
  }},
}};
"""

    # Add import
    if import_line not in content:
        lines = content.split("\n")
        last_import = 0
        for i, line in enumerate(lines):
            if line.startswith("import "):
                last_import = i
        lines.insert(last_import + 1, import_line)
        content = "\n".join(lines)

    # Add route before 'return router;'
    route_line = f'  router.post("/{route_path}", {adapter_name}(storageAdapter));'
    if route_line not in content:
        content = content.replace("  return router;", f"{route_line}\n\n  return router;")

    # Add swagger entry before closing of swagger object
    if full_path not in content:
        content = content.replace(
            "  },\n};",
            f"  {swagger_entry},\n  }},\n}};",
        )

    return content


# ──────────────────────────────────────────────────────────────────────
# Auto-normalize helper
# ──────────────────────────────────────────────────────────────────────

def _auto_normalize_before_scaffold(root: Path, slice_json_path: Path,
                                    em_base: str, context: str, folder: str) -> None:
    """Run the normalizer BEFORE scaffold reads from it.

    Produces .normalized.json so scaffold can consume it as its primary input.
    Silently skips if the normalizer script is not present.
    Looks for the normalize script relative to THIS script (not root), so it works
    in worktree scenarios where root points to an isolated copy.
    """
    import subprocess
    # Find normalize script relative to this scaffold script (sibling skill)
    this_script_dir = Path(__file__).resolve().parent
    normalize_script = this_script_dir.parent.parent / "evdb-normalize" / "scripts" / "normalize_slice.py"
    if not normalize_script.exists():
        # Fallback: try from root
        normalize_script = root / ".claude" / "skills" / "evdb-normalize" / "scripts" / "normalize_slice.py"
    if not normalize_script.exists():
        return
    try:
        subprocess.run(
            [sys.executable, str(normalize_script), str(slice_json_path), "--root", str(root)],
            check=False, capture_output=True, text=True,
        )
    except Exception:
        pass  # Normalize failure never blocks scaffolding


def _auto_normalize(root: Path, slice_json_path: Path) -> None:
    """Auto-run the normalizer + planner after scaffolding.

    Keeps .eventmodel/.normalized/ (IR) and .plan.json (generation plan) in sync.
    Silently skips if either script is not present — the scaffold still works
    without them; they are a value-add layer.
    """
    import subprocess
    scripts_dir = root / ".claude" / "skills" / "evdb-normalize" / "scripts"
    normalize_script = scripts_dir / "normalize_slice.py"
    plan_script = scripts_dir / "plan_slice.py"

    # Step 1: normalize → .normalized.json
    if not normalize_script.exists():
        return
    try:
        result = subprocess.run(
            [sys.executable, str(normalize_script), str(slice_json_path), "--root", str(root)],
            check=False, capture_output=True, text=True,
        )
        # Step 2: plan → .plan.json (only if normalize succeeded)
        if result.returncode == 0 and plan_script.exists():
            # Derive the normalized path from the normalize output line
            norm_line = result.stdout.strip()
            if norm_line.startswith("OK  "):
                norm_path = root / norm_line[4:].strip()
                subprocess.run(
                    [sys.executable, str(plan_script), str(norm_path)],
                    check=False, capture_output=True,
                )
    except Exception:
        pass  # IR/plan failure never blocks scaffolding


# ──────────────────────────────────────────────────────────────────────
# Orchestrator
# ──────────────────────────────────────────────────────────────────────

def _find_slice_in_indexes(root: Path, folder: str) -> tuple:
    """Find a slice across .eventmodel and .eventmodel2 index files.

    Returns: (index_path, index_data, slice_entry, eventmodel_base)
    """
    for em_dir in [".eventmodel", ".eventmodel2"]:
        index_path = root / em_dir / ".slices" / "index.json"
        if not index_path.exists():
            continue
        with open(index_path) as f:
            index = json.load(f)
        for s in index["slices"]:
            if s["folder"] == folder:
                return (index_path, index, s, em_dir)
    return (None, None, None, None)


def scaffold_slice(root: Path, folder: str, dry_run: bool = False) -> dict:
    """Scaffold all files for a slice. Returns a report of what was created."""
    index_path, index, slice_entry, em_base = _find_slice_in_indexes(root, folder)

    if not slice_entry:
        return {"error": f"Slice '{folder}' not found in any index.json (.eventmodel or .eventmodel2)"}

    context = slice_entry["context"]

    # Read slice.json
    slice_json_path = root / em_base / ".slices" / context / folder / "slice.json"
    if not slice_json_path.exists():
        return {"error": f"slice.json not found at {slice_json_path}"}

    with open(slice_json_path) as f:
        slice_data = json.load(f)

    # Ensure context is available in slice_data (it comes from index.json, not slice.json)
    if "context" not in slice_data:
        slice_data["context"] = context

    # Run normalize first to produce .normalized.json (if normalizer is available)
    _auto_normalize_before_scaffold(root, slice_json_path, em_base, context, folder)

    # Try to load from .normalized.json (single source of truth for derivations)
    norm_path = root / em_base / ".normalized" / context / f"{folder}.normalized.json"
    if norm_path.exists():
        with open(norm_path) as f:
            norm_data = json.load(f)
        event_id_map = build_event_id_map_from_normalized(root, context, em_base)
        ds = derive_slice_from_normalized(norm_data, event_id_map)
    else:
        # Fallback: derive from raw slice.json (legacy path)
        event_id_map = build_event_id_map(root, context)
        ds = derive_slice(slice_data, event_id_map)

    paths = SlicePaths(root, context, ds.slice_name, ds.stream)
    files_created = []
    files_updated = []

    def write_file(path: Path, content: str, is_update: bool = False):
        if dry_run:
            (files_updated if is_update else files_created).append(str(path.relative_to(root)))
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        (files_updated if is_update else files_created).append(str(path.relative_to(root)))

    # Detect slice type from DerivedSlice flags
    is_enrichment = bool(ds.backend_prompts) and not ds.has_commands
    is_projection = ds.is_projection

    if is_projection:
        # ── Projection slice: generate ProjectionConfig + test ────────
        projection_dir = paths.bc / "slices" / ds.slice_name
        projection_path = projection_dir / "index.ts"
        if not projection_path.exists():
            write_file(projection_path, gen_projection(ds))

        projection_test_path = projection_dir / "tests" / "projection.test.ts"
        if not projection_test_path.exists():
            write_file(projection_test_path, gen_projection_test(ds))

        # Integration test — runs SQL against real PostgreSQL
        integration_test_path = projection_dir / "projection.slice.test.ts"
        if not integration_test_path.exists():
            integration_content = gen_projection_integration_test(ds)
            if integration_content:
                write_file(integration_test_path, integration_content)

        # Update per-context projections.ts
        if not dry_run:
            projections_path = paths.bc / "slices" / "projections.ts"
            updated = update_context_projections(paths, slice_data, ds.slice_name)
            existing = projections_path.read_text() if projections_path.exists() else ""
            if updated != existing:
                write_file(projections_path, updated, is_update=bool(existing))

        # ── Message producers: wire inbound events to the outbox ──────
        # For each event this projection consumes, generate a message file
        # and register .withMessages() on the stream factory so events flow
        # through outbox → CDC → Kafka → this projection.
        readmodel = ds.raw.get("readmodels", [{}])[0]
        inbound_event_names = []
        for dep in readmodel.get("dependencies", []):
            if dep.get("type") == "INBOUND" and dep.get("elementType") == "EVENT":
                inbound_event_names.append(pascal_case(dep["title"]))

        if inbound_event_names:
            messages_dir = paths.swimlane / "messages"
            wired_events = []

            for en in inbound_event_names:
                msg_path = messages_dir / f"{en}Messages.ts"
                if not msg_path.exists():
                    # Find event fields from all slice.json files in this context
                    event_fields = []
                    slices_dir = root / em_base / ".slices" / context
                    if slices_dir.exists():
                        for sj in slices_dir.rglob("slice.json"):
                            sd = json.load(open(sj))
                            for ev in sd.get("events", []):
                                if pascal_case(ev["title"]) == en:
                                    event_fields = ev.get("fields", [])
                                    break
                            if event_fields:
                                break

                    iface = interface_name(en)
                    # Ensure the event interface file exists
                    event_file = paths.events_dir / f"{en}.ts"
                    if not event_file.exists() and event_fields:
                        write_file(event_file, gen_event_interface({"title": en, "fields": event_fields}))

                    write_file(msg_path, gen_event_message(en, iface, event_fields))
                    wired_events.append(en)

            # Wire .withMessages() on the stream factory
            if wired_events and paths.stream_factory.exists():
                updated = wire_messages_on_stream(paths, wired_events)
                if updated != paths.stream_factory.read_text():
                    if not dry_run:
                        paths.stream_factory.write_text(updated)
                    files_updated.append(str(paths.stream_factory.relative_to(root)))

    elif is_enrichment:
        # ── Enrichment-only slice: generate enrichment.ts + test ────────
        enrichment_dir = paths.bc / "endpoints" / ds.slice_name
        enrichment_path = enrichment_dir / "enrichment.ts"
        if not enrichment_path.exists():
            write_file(enrichment_path, gen_enrichment(ds))

        enrichment_test_path = enrichment_dir / "tests" / "enrichment.test.ts"
        if not enrichment_test_path.exists():
            write_file(enrichment_test_path, gen_enrichment_test(ds))

    else:
        # ── Standard slice: command → events → views pipeline ───────────

        # 1. Event interfaces
        for event in ds.events:
            en = event_name_from_title(event["title"], "")
            event_path = paths.event_file(en)
            if not event_path.exists():
                write_file(event_path, gen_event_interface(event))

        # 2. SliceState view (always when has_specs — gwts.ts and commandHandler.ts always reference it)
        view_name_str = ""
        if ds.has_specs:
            view_name_str = f"SliceState{ds.slice_name}"
            state_path = paths.view_state(view_name_str)
            handlers_path = paths.view_handlers(view_name_str)
            if not state_path.exists():
                write_file(state_path, gen_view_state(ds))
            if not handlers_path.exists():
                write_file(handlers_path, gen_view_handlers(ds))
            # View test skeleton
            view_test_path = paths.view_test(view_name_str)
            if not view_test_path.exists():
                write_file(view_test_path, gen_view_test(ds))

        has_commands = ds.has_commands

        # 3. Command (only if slice has commands)
        if has_commands:
            cmd_path = paths.slice_dir / "command.ts"
            if not cmd_path.exists():
                write_file(cmd_path, gen_command(ds))

            # 3b. Zod schema (only for slices with REST endpoints, not automations)
            if not ds.is_automation:
                schema_path = paths.slice_dir / "command.schema.ts"
                if not schema_path.exists():
                    write_file(schema_path, gen_zod_schema(ds))

        # 4. GWTS (only if specs)
        if ds.has_specs:
            gwts_path = paths.slice_dir / "gwts.ts"
            if not gwts_path.exists():
                write_file(gwts_path, gen_gwts(ds))

        # 5. Command handler (only if slice has commands)
        if has_commands:
            handler_path = paths.slice_dir / "commandHandler.ts"
            if not handler_path.exists():
                write_file(handler_path, gen_command_handler(ds))

        # 6. Adapter (only if slice has commands)
        if has_commands:
            adapter_path = paths.slice_dir / "adapter.ts"
            if not adapter_path.exists():
                write_file(adapter_path, gen_adapter(ds))

        # 7. Endpoint (REST or pg-boss depending on pattern; only if slice has commands)
        if has_commands:
            if ds.is_automation:
                endpoint_path = paths.pgboss_endpoint_dir / "index.ts"
                if not endpoint_path.exists():
                    write_file(endpoint_path, gen_pgboss_endpoint(ds))

                # 7a. Enrichment file for automation slices with generated fields + description
                if ds.has_enrichment:
                    enrichment_path = paths.bc / "endpoints" / ds.slice_name / "enrichment.ts"
                    if not enrichment_path.exists():
                        write_file(enrichment_path, gen_enrichment(ds))
                    enrichment_test_path = paths.bc / "endpoints" / ds.slice_name / "tests" / "enrichment.test.ts"
                    if not enrichment_test_path.exists():
                        write_file(enrichment_test_path, gen_enrichment_test(ds))

                # 7b. Message producer for the trigger event (so it reaches pg-boss via outbox)
                # The trigger event comes from either:
                # - trigger_info.trigger_event (cross-boundary Kafka pattern)
                # - The TODO readmodel's INBOUND event (same-context outbox pattern)
                trigger_event = ds.trigger_info.get("trigger_event", "")
                if not trigger_event and ds.trigger_info.get("trigger_readmodel"):
                    # Look up the TODO readmodel's inbound event from slice.json files
                    todo_rm_title = ds.trigger_info["trigger_readmodel"]
                    slices_dir_rm = root / em_base / ".slices" / context
                    if slices_dir_rm.exists():
                        for sj in slices_dir_rm.rglob("slice.json"):
                            sd_rm = json.load(open(sj))
                            for rm in sd_rm.get("readmodels", []):
                                if rm.get("title", "").strip() == todo_rm_title.strip():
                                    for dep in rm.get("dependencies", []):
                                        if dep.get("type") == "INBOUND" and dep.get("elementType") == "EVENT":
                                            trigger_event = dep["title"]
                                            break
                                if trigger_event:
                                    break
                            if trigger_event:
                                break
                if trigger_event:
                    trigger_en = pascal_case(trigger_event)
                    msg_path = paths.swimlane / "messages" / f"{trigger_en}Messages.ts"
                    if not msg_path.exists():
                        # Find trigger event fields from slice.json files in this context
                        trigger_fields = []
                        slices_dir = root / em_base / ".slices" / context
                        if slices_dir.exists():
                            for sj in slices_dir.rglob("slice.json"):
                                sd_tmp = json.load(open(sj))
                                for ev in sd_tmp.get("events", []):
                                    if pascal_case(ev["title"]) == trigger_en:
                                        trigger_fields = ev.get("fields", [])
                                        break
                                if trigger_fields:
                                    break
                        iface = interface_name(trigger_en)
                        write_file(msg_path, gen_automation_trigger_message(
                            trigger_en, iface, trigger_fields, context, ds.slice_name))
                    # Wire .withMessages() on the stream factory
                    if paths.stream_factory.exists():
                        updated = wire_messages_on_stream(paths, [trigger_en])
                        existing_sf = paths.stream_factory.read_text()
                        if updated != existing_sf:
                            if not dry_run:
                                paths.stream_factory.write_text(updated)
                            files_updated.append(str(paths.stream_factory.relative_to(root)))

                # 7c. Automation endpoint test
                auto_test_path = paths.bc / "endpoints" / ds.slice_name / "tests" / "automation.endpoint.test.ts"
                if not auto_test_path.exists():
                    write_file(auto_test_path, gen_automation_endpoint_test(ds))
            else:
                endpoint_path = paths.rest_endpoint_dir / "index.ts"
                if not endpoint_path.exists():
                    write_file(endpoint_path, gen_rest_endpoint(ds))

                # 7c. REST behaviour test (HTTP-level test with supertest)
                behaviour_test_path = paths.rest_endpoint_dir / "behaviour.test.ts"
                if not behaviour_test_path.exists():
                    write_file(behaviour_test_path, gen_rest_behaviour_test(ds))

        # 8. Tests (only if slice has commands)
        if has_commands:
            test_path = paths.tests_dir / "command.slice.test.ts"
            if not test_path.exists():
                if ds.is_automation:
                    write_file(test_path, gen_automation_slice_test(ds))
                else:
                    write_file(test_path, gen_test(ds))

    # 9-11: Stream factory, views type, routes (skip for enrichment-only and projection slices)
    if not is_enrichment and not is_projection:
        view_name_str = view_name_str if 'view_name_str' in dir() else ""

        # 9. Update stream factory (create minimal one if missing)
        if not paths.stream_factory.exists():
            if not dry_run:
                paths.stream_factory.parent.mkdir(parents=True, exist_ok=True)
            write_file(paths.stream_factory, gen_stream_factory(slice_data))
        if paths.stream_factory.exists():
            updated = update_stream_factory(paths, slice_data, ds.events, view_name_str)
            if updated != paths.stream_factory.read_text():
                write_file(paths.stream_factory, updated, is_update=True)

        # 10. Update views type
        if view_name_str:
            updated = update_views_type(paths, slice_data, view_name_str)
            existing = paths.views_type.read_text() if paths.views_type.exists() else ""
            if updated != existing:
                write_file(paths.views_type, updated, is_update=True)

        # 11. Update routes (REST only — only slices with commands get routes)
        if ds.has_commands and not ds.is_automation:
            existing = paths.routes.read_text() if paths.routes.exists() else ""
            updated = update_routes(paths, slice_data)
            if updated != existing:
                write_file(paths.routes, updated, is_update=paths.routes.exists())

    # 11b. Update per-context automations.ts (automation slices only)
    if not is_enrichment and ds.is_automation and not dry_run:
        automations_path = paths.bc / "endpoints" / "automations.ts"
        updated = update_context_automations(paths, slice_data, ds.slice_name)
        existing = automations_path.read_text() if automations_path.exists() else ""
        if updated != existing:
            write_file(automations_path, updated, is_update=bool(existing))

    # 12. Update index.json status
    if not dry_run:
        for s in index["slices"]:
            if s["folder"] == folder:
                s["status"] = "Review"
                break
        with open(index_path, "w") as f:
            json.dump(index, f, indent=2)
            f.write("\n")

    # 13. Generate TODO_CONTEXT.md — single file the AI reads instead of many
    if not dry_run:
        _gen_todo_context(paths, ds, files_created, files_updated)

    # 14. Auto-normalize: keep .eventmodel/.normalized/ in sync after scaffolding
    if not dry_run:
        _auto_normalize(root, slice_json_path)

    return {
        "slice": ds.slice_name,
        "folder": folder,
        "context": context,
        "files_created": files_created,
        "files_updated": files_updated,
        "total_files": len(files_created) + len(files_updated),
        "dry_run": dry_run,
    }


def _gen_todo_context(paths: SlicePaths, ds: DerivedSlice,
                      files_created: list, files_updated: list) -> None:
    """Generate TODO_CONTEXT.md — a single file the AI reads instead of many separate reads.

    Contains: slice summary, files with TODOs, spec details, backend prompts, and patterns.
    This eliminates the need for the AI to read slice.json, reference files, or existing code.
    """
    sn = ds.slice_name
    stream = ds.stream
    context = ds.context
    is_enrichment = bool(ds.backend_prompts) and not ds.has_commands
    is_proj = ds.is_projection
    backend_prompts = ds.backend_prompts

    lines = [
        f"# TODO Context for {sn}",
        "",
        f"Slice: {sn} | Context: {context} | Stream: {stream}",
    ]

    if is_proj:
        lines.append(f"Type: **Projection / Read Model** (STATE_VIEW)")
    elif is_enrichment:
        lines.append(f"Type: **Enrichment Processor** (backendPrompts-driven)")

    # Automation trigger info (for slices with AUTOMATION processors)
    if ds.is_automation:
        trigger = ds.trigger_info
        trigger_source = trigger.get("source", "event")
        if trigger.get("trigger_event"):
            lines.append(f"Trigger: **{trigger['trigger_event']}** event via Kafka CDC (source: `{trigger_source}`)")
            lines.append(f"Kafka topic: `{trigger.get('kafka_topic', 'events.' + pascal_case(trigger['trigger_event']))}`")
        elif trigger.get("trigger_readmodel"):
            lines.append(f"Trigger: **{trigger['trigger_readmodel']}** readmodel via outbox (source: `{trigger_source}`)")

    lines.extend(["", "## Files with TODOs (only edit these)", ""])

    # List files that need AI work
    todo_files = []
    if is_proj:
        todo_files.append(f"- `slices/{sn}/index.ts` — replace generic UPSERT with proper SQL: select specific fields, handle accumulation vs overwrite")
        todo_files.append(f"- `slices/{sn}/tests/projection.test.ts` — verify SQL params contain correct field values")
        todo_files.append(f"- `slices/{sn}/projection.slice.test.ts` — fill event payloads and expected state (runs against real PostgreSQL via testcontainers)")
    elif is_enrichment:
        todo_files.append(f"- `endpoints/{sn}/enrichment.ts` — implement enrichment logic per backendPrompts below")
        todo_files.append(f"- `endpoints/{sn}/tests/enrichment.test.ts` — verify enrichment output")
    else:
        if ds.has_specs:
            todo_files.append(f"- `slices/{sn}/gwts.ts` — fill in predicate conditions")
        todo_files.append(f"- `slices/{sn}/commandHandler.ts` — fill in computed event fields")
        if ds.is_automation:
            trigger = ds.trigger_info
            if ds.has_enrichment:
                todo_files.append(f"- `endpoints/{sn}/enrichment.ts` — implement enrichment logic per description below")
                todo_files.append(f"- `endpoints/{sn}/tests/enrichment.test.ts` — verify enrichment output")
            todo_files.append(f"- `endpoints/{sn}/tests/automation.endpoint.test.ts` — verify endpoint identity and mapping")
        if ds.has_specs:
            todo_files.append(f"- `slices/{sn}/tests/command.slice.test.ts` — verify test payloads match spec examples")
            todo_files.append(f"- `swimlanes/{stream}/views/SliceState{sn}/view.slice.test.ts` — adjust accumulation logic in tests")
    lines.extend(todo_files)
    lines.append("")

    # Backend prompts (for any slice type that has them)
    if backend_prompts:
        lines.append("## Backend Prompts (implementation instructions from the event modeler)")
        lines.append("")
        for i, prompt in enumerate(backend_prompts):
            if len(backend_prompts) > 1:
                lines.append(f"### Prompt {i + 1}")
            lines.append(prompt)
            lines.append("")

    # Enrichment processor details
    if is_enrichment:
        info = get_enrichment_info(ds.raw)
        input_fields = info.get("input_fields", [])
        enriched_fields = info.get("enriched_fields", [])

        lines.append("## Processor Fields")
        lines.append("")
        lines.append("**Input fields** (from trigger readmodel — passed through):")
        for f in input_fields:
            fn = field_name(f["name"])
            ft = ts_type(f.get("type", "String"))
            example = f.get("example", "")
            lines.append(f"  - `{fn}`: {ft}" + (f" (example: `{example}`)" if example else ""))
        lines.append("")
        lines.append("**Enriched fields** (computed by your enrichment function):")
        for f in enriched_fields:
            fn = field_name(f["name"])
            ft = ts_type(f.get("type", "String"))
            lines.append(f"  - `{fn}`: {ft}")
        lines.append("")

        if info.get("outbound_target"):
            lines.append(f"**Outbound**: enriched data feeds into command `{info['outbound_target']}`")
            lines.append("")

        lines.append("## Patterns")
        lines.append("")
        lines.append("```typescript")
        lines.append("// enrichment.ts — async function, takes input, returns input + enriched fields")
        lines.append("export async function enrich(input: Input): Promise<Output> {")
        lines.append("  // May call external APIs (use fetch)")
        lines.append("  const res = await fetch(`https://api.example.com/data?q=${input.field}`);")
        lines.append("  const data = await res.json();")
        lines.append("  return {")
        lines.append("    ...input,")
        lines.append("    computedField: Math.round(data.value * 100) / 100, // round to 2dp")
        lines.append("  };")
        lines.append("}")
        lines.append("```")
        lines.append("")
        lines.append("- Handle edge cases (e.g. same-currency shortcut: skip API call)")
        lines.append("- Round numeric results to 2 decimal places where appropriate")
        lines.append("")
    elif is_proj:
        # Projection slice details
        readmodel = ds.raw["readmodels"][0]
        rm_fields = readmodel.get("fields", [])
        rm_description = readmodel.get("description", "")
        inbound_events = [
            pascal_case(dep["title"])
            for dep in readmodel.get("dependencies", [])
            if dep.get("type") == "INBOUND" and dep.get("elementType") == "EVENT"
        ]

        # Extract key pattern from description (e.g. "Key: {currency}:{reportDate}")
        import re as _re
        key_match = _re.findall(r'\{(\w+)\}', _re.search(r'Key:\s*(.+?)(?:\.|$)', rm_description).group(1)) if 'Key:' in rm_description else []

        if rm_description:
            lines.append("## Readmodel Description (from the event modeler)")
            lines.append("")
            lines.append(rm_description)
            lines.append("")

        lines.append("## Readmodel Fields (columns of the projection)")
        lines.append("")
        for f in rm_fields:
            fn = field_name(f["name"])
            ft = ts_type(f.get("type", "String"))
            example = f.get("example", "")
            lines.append(f"  - `{fn}`: {ft}" + (f" (example: `{example}`)" if example else ""))
        lines.append("")

        if key_match:
            key_expr = "`:`.join([" + ", ".join(f"p.{k}" for k in key_match) + "])" if len(key_match) > 1 else f"p.{key_match[0]}"
            lines.append(f"**Key**: composite key from `{', '.join(key_match)}` — construct as template literal: `` `{'{'}${'}{'.join(f'p.{k}' for k in key_match)}{'}'}` ``")
        else:
            # Fallback: first UUID field or first field
            fallback_key = "account"
            for f in rm_fields:
                if f.get("type") == "UUID":
                    fallback_key = field_name(f["name"])
                    break
            lines.append(f"**Key**: `{fallback_key}`")
        lines.append("")

        lines.append("## Inbound Events (triggers this projection)")
        lines.append("")
        for evt in inbound_events:
            lines.append(f"  - `{evt}`")
        lines.append("")

        lines.append("## Patterns (projection SQL)")
        lines.append("")
        lines.append("```typescript")
        lines.append("// UPSERT with accumulation using jsonb_build_object")
        lines.append("// IMPORTANT: every $N parameter inside jsonb_build_object MUST have an explicit cast")
        lines.append("// PostgreSQL cannot infer types in jsonb context — uncast params cause runtime errors")
        lines.append("handlers: {")
        lines.append('  EventName: (payload, { projectionName }) => {')
        lines.append("    const p = payload as PayloadType;")
        lines.append("    const key = `${p.currency}:${p.reportDate}`;  // composite key")
        lines.append("    return [{")
        lines.append("      sql: `")
        lines.append("        INSERT INTO projections (name, key, payload)")
        lines.append("        VALUES ($1, $2, jsonb_build_object(")
        lines.append("          'account', $3::text,")
        lines.append("          'totalAmount', $4::numeric,")
        lines.append("          'count', 1")
        lines.append("        ))")
        lines.append("        ON CONFLICT (name, key) DO UPDATE")
        lines.append("          SET payload = jsonb_build_object(")
        lines.append("            'account', $3::text,")
        lines.append("            'totalAmount', (projections.payload->>'totalAmount')::numeric + $4::numeric,")
        lines.append("            'count', (projections.payload->>'count')::int + 1")
        lines.append("          )`,")
        lines.append("      params: [projectionName, key, p.account, p.amount],")
        lines.append("    }];")
        lines.append("  },")
        lines.append("}")
        lines.append("```")
        lines.append("")
        lines.append("### Key rules")
        lines.append("- Use `projectionName` param (from meta), never hardcode the projection name")
        lines.append("- **Every parameter inside jsonb_build_object() MUST have a type cast** ($3::text, $4::numeric) — PostgreSQL cannot infer types in jsonb context")
        lines.append("- Pass individual fields as params, not JSON.stringify(p) — this enables field-level accumulation")
        lines.append("- For accumulation fields (totals, counts): read existing value with `(projections.payload->>'field')::numeric` and add the new param")
        lines.append("- For overwrite fields (status, name): just use the param directly ($N::text)")
        lines.append("- Composite keys: build as template literal from payload fields")
        lines.append("")
    else:
        # Standard slice patterns
        # Spec details — the AI needs these to fill TODOs
        if ds.specs:
            lines.append("## Specifications (GWT)")
            lines.append("")
            for spec in ds.specs:
                pred_name = extract_predicate(spec)
                title = spec.get("title", pred_name)
                lines.append(f"### {title}")
                lines.append(f"Predicate: `{pred_name}`")

                # Given
                given_list = spec.get("given", [])
                if given_list:
                    lines.append("**Given** (prior events in stream):")
                    for g in given_list:
                        en = resolve_given_event_name(g, ds.event_id_map)
                        fields_str = ", ".join(f"{field_name(f['name'])}={f.get('example', '?')}" for f in g.get("fields", []))
                        lines.append(f"  - {en}: {fields_str}")

                # When
                when_cmd = spec.get("when", [{}])[0]
                when_fields = when_cmd.get("fields", [])
                fields_str = ", ".join(f"{field_name(f['name'])}={f.get('example', '?')}" for f in when_fields)
                lines.append(f"**When** command: {fields_str}")

                # Then
                then_events = spec.get("then", [])
                if then_events:
                    for te in then_events:
                        en = event_name_from_title(te["title"], "")
                        fields_str = ", ".join(f"{field_name(f['name'])}={f.get('example', '?')}" for f in te.get("fields", []))
                        lines.append(f"**Then** emit {en}: {fields_str}")
                else:
                    lines.append("**Then** no events (idempotent)")
                lines.append("")

        # Event field details for computed fields
        computed_fields = []
        for event in ds.events:
            en = event_name_from_title(event["title"], "")
            for f in event.get("fields", []):
                fn = field_name(f["name"])
                if fn not in ds.command_field_names:
                    computed_fields.append((en, fn, f.get("example", ""), f.get("type", "String")))

        if computed_fields:
            lines.append("## Computed event fields (not on command)")
            lines.append("")
            lines.append("These must be derived from command fields in the handler:")
            for en, fn, example, ft in computed_fields:
                lines.append(f"  - `{en}.{fn}` ({ft}) — example value: `{example}`")
            lines.append("")

        lines.append("## API Patterns (exact syntax — do NOT deviate)")
        lines.append("")
        lines.append("### Command handler — append events")
        lines.append("```typescript")
        lines.append("// CORRECT: stream.appendEvent{EventName}({ plain payload })")
        lines.append("stream.appendEventFundsWithdrawalApproved({")
        lines.append("  account: command.account,")
        lines.append("  amount: command.amount,")
        lines.append("});")
        lines.append("// WRONG: stream.addEvent(), stream.emit(), eventType in payload")
        lines.append("```")
        lines.append("")
        lines.append("### Event interface — plain, no inheritance")
        lines.append("```typescript")
        lines.append("// CORRECT: plain interface, I-prefix, no eventType field")
        lines.append("export interface IFundsWithdrawalApproved {")
        lines.append("  readonly account: string;")
        lines.append("  readonly amount: number;")
        lines.append("}")
        lines.append("// WRONG: extends IEvDbEvent, eventType field")
        lines.append("```")
        lines.append("")
        lines.append("### Stream factory — register events")
        lines.append("```typescript")
        lines.append("// CORRECT: .withEvent(\"Name\").asType<IType>()")
        lines.append("new StreamFactoryBuilder(\"FundsStream\")")
        lines.append("  .withEvent(\"FundsWithdrawalApproved\").asType<IFundsWithdrawalApproved>()")
        lines.append("  .build();")
        lines.append("// WRONG: .addEventType<T>(), .registerEvent()")
        lines.append("```")
        lines.append("")
        lines.append("### Test events — envelope format")
        lines.append("```typescript")
        lines.append("// CORRECT: { eventType, payload: { ...fields } }")
        lines.append("const expectedEvents: TestEvent[] = [")
        lines.append("  {")
        lines.append("    eventType: \"FundsWithdrawalApproved\",")
        lines.append("    payload: {")
        lines.append("      account: \"1234\",")
        lines.append("      amount: 20,")
        lines.append("    },")
        lines.append("  },")
        lines.append("];")
        lines.append("// WRONG: flat { eventType, account, amount }")
        lines.append("```")
        lines.append("")
        lines.append("### View test format (ViewSliceTester)")
        lines.append("```typescript")
        lines.append("ViewSliceTester.run(viewConfig, [")
        lines.append("  {")
        lines.append('    description: "event updates state correctly",')
        lines.append("    given: [")
        lines.append('      { eventType: "EventName", payload: { field: value } },')
        lines.append("    ],")
        lines.append("    then: { field: expectedValue }, // expected state after folding")
        lines.append("  },")
        lines.append("]);")
        lines.append("// 'given' = events to fold, 'then' = expected view state after folding")
        lines.append("// For accumulation: two given events, 'then' has accumulated value")
        lines.append("// For overwrite: 'then' matches last event's value")
        lines.append("```")
        lines.append("")
        lines.append("### Other patterns")
        lines.append("- `commandHandler.ts`: pure function, only `stream.appendEvent*()` calls, no I/O")
        lines.append("- `gwts.ts`: `(state, command) => boolean` — compare state fields vs command fields")
        lines.append("- View handlers: `(state, event) => ({ ...state, field: event.field })`")
        lines.append("- All event payloads in tests must include ALL fields from the event interface")
        lines.append("")

    # Files created/updated summary
    lines.append("## All scaffold output")
    lines.append("")
    for f in files_created:
        lines.append(f"  + {f}")
    for f in files_updated:
        lines.append(f"  ~ {f}")
    lines.append("")

    # For enrichment slices, write TODO_CONTEXT.md in the endpoint dir
    if is_enrichment:
        context_path = paths.bc / "endpoints" / sn / "TODO_CONTEXT.md"
    else:
        context_path = paths.slice_dir / "TODO_CONTEXT.md"
    context_path.parent.mkdir(parents=True, exist_ok=True)
    context_path.write_text("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(description="Deterministic evdb slice scaffold generator")
    parser.add_argument("--root", default=".", help="Project root")
    parser.add_argument("--slice", default=None, help="Slice folder name to scaffold")
    parser.add_argument("--all-planned", action="store_true", help="Scaffold all Planned slices")
    parser.add_argument("--context", default=None, help="Only scaffold slices in this context (use with --all-planned)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be created without writing")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    root = Path(args.root).resolve()

    if args.all_planned:
        # Scan both .eventmodel and .eventmodel2 for scaffoldable slices
        # "Planned" (.eventmodel) and "Created" (.eventmodel2) are both scaffoldable
        planned = []
        scaffoldable_statuses = {"Planned", "Created"}
        for em_dir in [".eventmodel", ".eventmodel2"]:
            idx_path = root / em_dir / ".slices" / "index.json"
            if not idx_path.exists():
                continue
            with open(idx_path) as f:
                idx = json.load(f)
            for s in sorted(idx["slices"], key=lambda x: x["index"]):
                if s["status"] in scaffoldable_statuses:
                    if args.context and s.get("context") != args.context:
                        continue
                    if args.context and s.get("context") != args.context:
                        continue
                    planned.append(s["folder"])

        results = []
        for folder in planned:
            result = scaffold_slice(root, folder, args.dry_run)
            results.append(result)
            icon = "✓" if "error" not in result else "✗"
            print(f"  {icon} {folder}: {result.get('total_files', 0)} files")

        if args.json:
            print(json.dumps(results, indent=2))
        else:
            total = sum(r.get("total_files", 0) for r in results)
            print(f"\n  Scaffolded {len(results)} slices, {total} files total")

    elif args.slice:
        result = scaffold_slice(root, args.slice, args.dry_run)

        if args.json:
            print(json.dumps(result, indent=2))
        else:
            if "error" in result:
                print(f"  Error: {result['error']}")
                sys.exit(1)
            prefix = "[DRY RUN] " if args.dry_run else ""
            print(f"  {prefix}Scaffolded {result['slice']} ({result['total_files']} files)")
            for f in result.get("files_created", []):
                print(f"    + {f}")
            for f in result.get("files_updated", []):
                print(f"    ~ {f}")
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
