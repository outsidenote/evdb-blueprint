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
# Path helpers
# ──────────────────────────────────────────────────────────────────────

class SlicePaths:
    """Computes all file paths for a slice."""

    def __init__(self, root: Path, context: str, slice_name: str, stream: str):
        self.root = root
        self.bc = root / "src" / "BusinessCapabilities" / context
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
# Template generators
# ──────────────────────────────────────────────────────────────────────

def gen_event_interface(event: dict) -> str:
    """Generate event interface file content."""
    name = event_name_from_title(event["title"], "")
    iface = interface_name(name)
    fields = event.get("fields", [])

    lines = [f"export interface {iface} {{"]
    for f in fields:
        fn = field_name(f["name"])
        ft = ts_type(f.get("type", "String"))
        lines.append(f"  readonly {fn}: {ft};")
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def gen_command(slice_data: dict) -> str:
    """Generate command.ts content.

    ALL fields are included in the interface — including generated: true fields.
    Generated fields are part of the command type; they're only computed at the
    REST/pg-boss endpoint layer, not excluded from the TS interface.
    """
    sn = slice_name_pascal(slice_data)
    cmd = slice_data["commands"][0]
    fields = cmd.get("fields", [])

    lines = [
        'import type { ICommand } from "#abstractions/commands/ICommand.js";',
        "",
        f"export interface {sn} extends ICommand {{",
        f'  readonly commandType: "{sn}";',
    ]
    for f in fields:
        fn = field_name(f["name"])
        ft = ts_type(f.get("type", "String"))
        lines.append(f"  readonly {fn}: {ft};")
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def gen_gwts(slice_data: dict) -> str:
    """Generate gwts.ts with predicate stubs."""
    sn = slice_name_pascal(slice_data)
    specs = slice_data.get("specifications", [])

    view_state_type = f"SliceState{sn}ViewState"
    stream = stream_name(slice_data["context"])
    context = slice_data["context"]

    lines = [
        f'import type {{ {sn} }} from "./command.js";',
        f'import type {{ {view_state_type} }} from "#BusinessCapabilities/{context}/swimlanes/{stream}/views/SliceState{sn}/state.js";',
        "",
        "/**",
        " * Named spec predicates derived from the event model's GWT specifications.",
        " * Each function maps 1:1 to a named spec in the event model diagram.",
        " */",
        "",
    ]

    for spec in specs:
        pred_name = "unknownPredicate"
        comments = spec.get("comments", [])
        if comments and comments[0].get("description"):
            pred_name = predicate_name(comments[0]["description"])

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
        view_state_type = f"SliceState{sn}ViewState"
        lines.append(f"export const {pred_name} = (state: {view_state_type}, command: {sn}): boolean =>")
        lines.append(f"  false; // TODO: return boolean comparing state.{given_fields_hint[0] if given_fields_hint else 'field'} vs command.{when_fields_hint[0] if when_fields_hint else 'field'}")
        lines.append("")

    return "\n".join(lines)


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


def gen_command_handler(slice_data: dict) -> str:
    """Generate commandHandler.ts with TODO body."""
    sn = slice_name_pascal(slice_data)
    stream = stream_name(slice_data["context"])
    specs = slice_data.get("specifications", [])
    events = slice_data.get("events", [])

    # Build set of ALL command field names (all are on the interface now)
    cmd = slice_data["commands"][0] if slice_data.get("commands") else {}
    cmd_field_names = {field_name(f["name"]) for f in cmd.get("fields", [])}

    # Determine if we need gwts import
    has_specs = bool(specs)
    predicates = []
    for spec in specs:
        comments = spec.get("comments", [])
        if comments and comments[0].get("description"):
            predicates.append(predicate_name(comments[0]["description"]))

    lines = [
        f'import type {{ CommandHandler }} from "#abstractions/commands/commandHandler.js";',
        f'import type {{ {sn} }} from "./command.js";',
        f'import type {{ {stream}StreamType }} from "#BusinessCapabilities/{slice_data["context"]}/swimlanes/{stream}/index.js";',
    ]

    if has_specs:
        pred_imports = ", ".join(predicates) if predicates else ""
        if pred_imports:
            lines.append(f'import {{ {pred_imports} }} from "./gwts.js";')

    lines.extend([
        "",
        "/**",
        f" * Pure command handler for the {sn} command.",
        " * ONLY appends events — no I/O, no fetching, no returning values.",
        " */",
        f"export const handle{sn}: CommandHandler<",
        f"  {stream}StreamType,",
        f"  {sn}",
        "> = (stream, command) => {",
    ])

    if has_specs:
        # Destructure state fields from the view — only when given events exist.
        # Slices with no given[] events need no state; skip the destructure so the
        # handler doesn't crash if the view isn't registered in the stream factory.
        seen = set()
        state_fields = []
        for spec in specs:
            for given in spec.get("given", []):
                for f in given.get("fields", []):
                    fn = field_name(f["name"])
                    if fn not in seen:
                        seen.add(fn)
                        state_fields.append(fn)
        if state_fields:
            destructure = ", ".join(state_fields)
            lines.append(f"  const {{ {destructure} }} = stream.views.SliceState{sn};")
            lines.append("")

    # Generate if/else structure from specs
    if specs:
        for i, spec in enumerate(specs):
            pred_name = "unknownPredicate"
            comments = spec.get("comments", [])
            if comments and comments[0].get("description"):
                pred_name = predicate_name(comments[0]["description"])

            then_events = spec.get("then", [])
            keyword = "if" if i == 0 else "} else if"

            lines.append(f"  {keyword} ({pred_name}(stream.views.SliceState{sn}, command)) {{")

            if not then_events:
                lines.append("    // Empty then[] — idempotent no-op, append no events")
                lines.append("    return;")
            else:
                for te in then_events:
                    en = event_name_from_title(te["title"], "")
                    lines.append(f"    stream.appendEvent{en}({{")
                    full_event = _find_event_by_title(events, te["title"])
                    event_fields = full_event.get("fields", []) if full_event else te.get("fields", [])
                    for f in event_fields:
                        fn = field_name(f["name"])
                        if fn in cmd_field_names:
                            lines.append(f"      {fn}: command.{fn},")
                        else:
                            ft = f.get("type", "String")
                            example = f.get("example", "")
                            hint = f" — example: {example}" if example else ""
                            if ft == "String":
                                lines.append(f'      {fn}: "", // TODO: derive from command fields{hint}')
                            elif ft in ("Double", "Integer", "Int"):
                                lines.append(f"      {fn}: 0, // TODO: calculate from command fields{hint}")
                            elif ft == "DateTime":
                                lines.append(f"      {fn}: new Date(), // TODO: computed field{hint}")
                            else:
                                lines.append(f'      {fn}: "", // TODO: derive from command fields{hint}')
                    lines.append(f"    }});")

        # Default (happy) path
        lines.append("  } else {")
        # Find the "positive" event (first event not in any spec.then)
        spec_event_titles = set()
        for spec in specs:
            for te in spec.get("then", []):
                spec_event_titles.add(te["title"])

        default_events = [e for e in events if e["title"] not in spec_event_titles]
        if not default_events:
            default_events = events[:1]

        for de in default_events:
            en = event_name_from_title(de["title"], "")
            lines.append(f"    stream.appendEvent{en}({{")
            for f in de.get("fields", []):
                fn = field_name(f["name"])
                if fn in cmd_field_names:
                    lines.append(f"      {fn}: command.{fn},")
                else:
                    ft = f.get("type", "String")
                    example = f.get("example", "")
                    hint = f" — example: {example}" if example else ""
                    if ft == "String":
                        lines.append(f'      {fn}: "", // TODO: derive from command fields{hint}')
                    elif ft in ("Double", "Integer", "Int"):
                        lines.append(f"      {fn}: 0, // TODO: calculate from command fields{hint}")
                    elif ft == "DateTime":
                        lines.append(f"      {fn}: new Date(), // TODO: computed field{hint}")
                    else:
                        lines.append(f'      {fn}: "", // TODO: derive from command fields{hint}')
            lines.append(f"    }});")
        lines.append("  }")
    else:
        # No specs — single event, simple flow
        if events:
            en = event_name_from_title(events[0]["title"], "")
            lines.append(f"  stream.appendEvent{en}({{")
            lines.append(f"    // TODO: map command fields to event payload")
            lines.append(f"  }});")

    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def gen_adapter(slice_data: dict) -> str:
    """Generate adapter.ts."""
    sn = slice_name_pascal(slice_data)
    stream = stream_name(slice_data["context"])
    context = slice_data["context"]
    cmd = slice_data["commands"][0]

    # Determine stream ID field from aggregate
    aggregate = cmd.get("aggregate", "")
    # Find the likely ID field — first UUID field or 'account'
    id_field = "account"
    for f in cmd.get("fields", []):
        if f.get("idAttribute"):
            id_field = field_name(f["name"])
            break
        if f.get("type") == "UUID" and not f.get("generated"):
            id_field = field_name(f["name"])
            break

    return f'''import type {{ {sn} }} from "./command.js";
import {{ handle{sn} }} from "./commandHandler.js";
import {{ CommandHandlerOrchestratorFactory }} from "#abstractions/commands/CommandHandlerOrchestratorFactory.js";
import type {{ CommandHandlerOrchestrator }} from "#abstractions/commands/commandHandler.js";
import {stream}StreamFactory from "#BusinessCapabilities/{context}/swimlanes/{stream}/index.js";
import type {{ IEvDbStorageAdapter }} from "@eventualize/core/adapters/IEvDbStorageAdapter";

export function create{sn}Adapter(storageAdapter: IEvDbStorageAdapter): CommandHandlerOrchestrator<{sn}> {{
  return CommandHandlerOrchestratorFactory.create(
    storageAdapter,
    {stream}StreamFactory,
    (command: {sn}) => command.{id_field},
    handle{sn},
  );
}}
'''


def gen_rest_endpoint(slice_data: dict) -> str:
    """Generate REST endpoint index.ts."""
    sn = slice_name_pascal(slice_data)
    sn_camel = camel_case(sn)
    context = slice_data["context"]
    cmd = slice_data["commands"][0]
    fields = cmd.get("fields", [])

    user_fields = [f for f in fields if not f.get("generated")]
    generated_fields = [f for f in fields if f.get("generated")]

    # Required fields (first UUID or the first field)
    required = []
    for f in user_fields:
        fn = field_name(f["name"])
        if f.get("type") == "UUID" or fn == "account":
            required.append(fn)
    if not required and user_fields:
        required = [field_name(user_fields[0]["name"])]

    # Destructure
    destructure_fields = [field_name(f["name"]) for f in user_fields]

    lines = [
        'import type { Request, Response } from "express";',
        'import { randomUUID } from "node:crypto";',
        f'import {{ create{sn}Adapter }} from "#BusinessCapabilities/{context}/slices/{sn}/adapter.js";',
        'import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";',
        "",
        f"export const create{sn}RestAdapter = (storageAdapter: IEvDbStorageAdapter) => {{",
        f"  const {sn_camel} = create{sn}Adapter(storageAdapter);",
        "",
        "  return async (req: Request, res: Response) => {",
        "    try {",
        f"      const {{",
    ]
    for fn in destructure_fields:
        lines.append(f"        {fn},")
    lines.append("      } = req.body;")
    lines.append("")

    # Validation
    if required:
        conditions = " || ".join(f"!{fn}" for fn in required)
        required_str = " and ".join(required)
        lines.append(f'      if ({conditions}) {{')
        lines.append(f'        res.status(400).json({{ error: "{required_str} is required" }});')
        lines.append(f'        return;')
        lines.append(f'      }}')
        lines.append("")

    lines.append("      const command = {")
    lines.append(f'        commandType: "{sn}" as const,')
    for f in user_fields:
        fn = field_name(f["name"])
        ft = f.get("type", "String")
        if ft == "Double":
            lines.append(f"        {fn}: Number({fn}),")
        elif fn == "transactionId":
            lines.append(f"        {fn}: {fn} ?? randomUUID(),")
        else:
            lines.append(f"        {fn},")

    for f in generated_fields:
        fn = field_name(f["name"])
        ft = f.get("type", "String")
        if ft == "DateTime":
            lines.append(f"        {fn}: new Date(),")
        elif ft == "UUID":
            lines.append(f"        {fn}: randomUUID(),")
        elif ft == "Double":
            lines.append(f"        {fn}: 0, // TODO: compute generated field")
        else:
            lines.append(f'        {fn}: "", // TODO: compute generated field')

    lines.extend([
        "      };",
        "",
        f"      const result = await {sn_camel}(command);",
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
        f'      console.error("POST /{kebab_case(sn)} error:", err);',
        "      res.status(500).json({ error: message });",
        "    }",
        "  };",
        "};",
        "",
    ])
    return "\n".join(lines)


def is_automation_slice(slice_data: dict) -> bool:
    """Detect Pattern 5: automation processor (pg-boss triggered)."""
    for proc in slice_data.get("processors", []):
        if proc.get("type") == "AUTOMATION":
            return True
    return False


def get_trigger_info(slice_data: dict) -> dict:
    """Extract trigger event info from automation processor dependencies.

    Supports both .eventmodel (INBOUND READMODEL) and .eventmodel2 (INBOUND EVENT) patterns.

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


def gen_pgboss_endpoint(slice_data: dict) -> str:
    """Generate pg-boss automation endpoint index.ts.

    Supports both delivery patterns:
    - source: "event"   → same-context, outbox trigger (INBOUND READMODEL)
    - source: "message" → cross-boundary, Kafka CDC (INBOUND EVENT)
    """
    sn = slice_name_pascal(slice_data)
    sn_camel = camel_case(sn)
    context = slice_data["context"]
    trigger = get_trigger_info(slice_data)
    payload_fields = trigger.get("payload_fields", [])
    source = trigger.get("source", "event")
    kafka_topic = trigger.get("kafka_topic")

    # Derive message type from trigger
    if trigger.get("trigger_event"):
        # .eventmodel2: INBOUND EVENT → use the event title directly
        message_type = pascal_case(trigger["trigger_event"])
    elif trigger.get("trigger_readmodel"):
        # .eventmodel: INBOUND READMODEL → derive from readmodel name
        trigger_readmodel = trigger["trigger_readmodel"]
        message_type = pascal_case(trigger_readmodel.replace("TODO", "").replace("To-Do", "").strip())
    else:
        message_type = "Unknown"

    # Check if this processor has enrichment (generated fields + description)
    has_enrichment = any(f.get("generated") for f in payload_fields) and trigger.get("description")

    # Build payload interface fields (only non-generated = what comes from the trigger event)
    input_fields = [f for f in payload_fields if not f.get("generated")]
    payload_lines = []
    for f in input_fields:
        fn = field_name(f["name"])
        ft = ts_type(f.get("type", "String"))
        payload_lines.append(f"  readonly {fn}: {ft};")

    # Build command mapping — match processor fields to command fields
    cmd = slice_data["commands"][0] if slice_data.get("commands") else {}
    cmd_fields = cmd.get("fields", [])

    # Build set of enriched field names from the processor (generated: true on processor fields)
    enriched_field_names = {field_name(pf["name"]) for pf in payload_fields if pf.get("generated")}

    map_lines = []
    map_lines.append(f'    commandType: "{sn}" as const,')
    for f in cmd_fields:
        fn = field_name(f["name"])
        ft = f.get("type", "String")
        if has_enrichment and fn in enriched_field_names:
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
                map_lines.append(f"    {fn}: payload.{fn},")
            else:
                map_lines.append(f'    {fn}: "", // TODO: not in trigger payload')

    payload_interface_name = f"{message_type}Payload"

    # Imports
    lines = [
        f'import {{ defineAutomationEndpoint }} from "#abstractions/endpoints/defineAutomationEndpoint.js";',
        f'import {{ create{sn}Adapter }} from "#BusinessCapabilities/{context}/slices/{sn}/adapter.js";',
    ]
    if has_enrichment:
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
    lines.append(f'  handlerName: "{sn}",')
    lines.append(f"  createAdapter: create{sn}Adapter,")

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
    if has_enrichment:
        lines.append(f"  mapPayloadToCommand: async (payload: {payload_interface_name}) => {{")
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


def has_backend_prompts(slice_data: dict) -> bool:
    """Check if this slice has enrichment instructions.

    Supports both formats:
    - .eventmodel:  codeGen.backendPrompts[] on the slice
    - .eventmodel2: description on individual AUTOMATION processors
    """
    if slice_data.get("codeGen", {}).get("backendPrompts"):
        return True
    # .eventmodel2: check processor descriptions
    for proc in slice_data.get("processors", []):
        if proc.get("type") == "AUTOMATION" and proc.get("description"):
            return True
    return False


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
    input_fields = [f for f in all_fields if not f.get("generated")]
    enriched_fields = [f for f in all_fields if f.get("generated")]

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


def gen_enrichment(slice_data: dict) -> str:
    """Generate enrichment.ts skeleton with input/output interfaces and a TODO body."""
    sn = slice_name_pascal(slice_data)
    info = get_enrichment_info(slice_data)
    input_fields = info.get("input_fields", [])
    enriched_fields = info.get("enriched_fields", [])

    # Build input interface
    input_lines = [f"export interface {sn}EnrichmentInput {{"]
    for f in input_fields:
        fn = field_name(f["name"])
        ft = ts_type(f.get("type", "String"))
        input_lines.append(f"  readonly {fn}: {ft};")
    input_lines.append("}")

    # Build output interface (extends input + enriched fields)
    output_lines = [f"export interface {sn}EnrichmentOutput extends {sn}EnrichmentInput {{"]
    for f in enriched_fields:
        fn = field_name(f["name"])
        ft = ts_type(f.get("type", "String"))
        output_lines.append(f"  readonly {fn}: {ft};")
    output_lines.append("}")

    # Function skeleton with TODO
    lines = [
        *input_lines,
        "",
        *output_lines,
        "",
        f"export async function enrich(input: {sn}EnrichmentInput): Promise<{sn}EnrichmentOutput> {{",
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


def gen_enrichment_test(slice_data: dict) -> str:
    """Generate enrichment.test.ts skeleton for an enrichment processor."""
    sn = slice_name_pascal(slice_data)
    info = get_enrichment_info(slice_data)
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
        if ft in ("Double", "Integer", "Int", "Decimal", "Float"):
            check_lines.append(f'    assert.strictEqual(typeof result.{fn}, "number");')
        elif ft in ("DateTime", "Date"):
            check_lines.append(f"    assert.ok(result.{fn} instanceof Date);")
        else:
            check_lines.append(f'    assert.strictEqual(typeof result.{fn}, "string");')

    lines = [
        'import { describe, it } from "node:test";',
        'import assert from "node:assert/strict";',
        f'import {{ enrich }} from "../enrichment.js";',
        "",
        f'describe("{sn} Enrichment", () => {{',
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


def gen_automation_endpoint_test(slice_data: dict) -> str:
    """Generate automation endpoint test — identity check only.

    The full payload → enrich → command → events pipeline is tested in
    command.slice.test.ts (via gen_automation_slice_test).
    This test just verifies the endpoint wiring is correct.
    """
    sn = slice_name_pascal(slice_data)
    trigger = get_trigger_info(slice_data)
    source = trigger.get("source", "event")

    # Derive message type
    if trigger.get("trigger_event"):
        message_type = pascal_case(trigger["trigger_event"])
    elif trigger.get("trigger_readmodel"):
        message_type = pascal_case(trigger["trigger_readmodel"].replace("TODO", "").replace("To-Do", "").strip())
    else:
        message_type = "Unknown"

    lines = [
        'import { describe, it } from "node:test";',
        'import assert from "node:assert/strict";',
        f'import {{ endpointIdentity }} from "../pg-boss/index.js";',
        "",
        f'describe("{sn} Automation Endpoint", () => {{',
        f'  it("has correct endpoint identity", () => {{',
        f'    assert.strictEqual(endpointIdentity.source, "{source}");',
        f'    assert.strictEqual(endpointIdentity.messageType, "{message_type}");',
        f'    assert.strictEqual(endpointIdentity.handlerName, "{sn}");',
        f'    assert.strictEqual(endpointIdentity.queueName, "{source}.{message_type}.{sn}");',
        "  });",
        "});",
        "",
    ]
    return "\n".join(lines)


def gen_automation_slice_test(slice_data: dict) -> str:
    """Generate command.slice.test.ts for automation slices.

    Tests the full slice pipeline from the Kafka payload perspective:
      payload → enrich() → build command → command handler → events

    This is different from standard slice tests which start from the command.
    Automation slice tests start from the raw payload (what Kafka delivers).
    """
    sn = slice_name_pascal(slice_data)
    stream = stream_name(slice_data["context"])
    context = slice_data["context"]
    events = slice_data.get("events", [])
    cmd = slice_data["commands"][0] if slice_data.get("commands") else {}
    cmd_fields = cmd.get("fields", [])
    trigger = get_trigger_info(slice_data)
    payload_fields = trigger.get("payload_fields", [])
    input_fields = [f for f in payload_fields if not f.get("generated")]
    enriched_field_names = {field_name(pf["name"]) for pf in payload_fields if pf.get("generated")}
    has_enrichment = any(f.get("generated") for f in payload_fields) and trigger.get("description")

    # Build sample payload entries (input fields only — what arrives from Kafka)
    payload_entries = []
    for f in input_fields:
        fn = field_name(f["name"])
        payload_entries.append(f"    {fn}: {_format_example(f)},")

    # Build command mapping lines (payload fields + enriched fields)
    cmd_mapping = []
    cmd_mapping.append(f'    commandType: "{sn}" as const,')
    for f in cmd_fields:
        fn = field_name(f["name"])
        if has_enrichment and fn in enriched_field_names:
            cmd_mapping.append(f"    {fn}: enriched.{fn},")
        else:
            proc_field_names = {field_name(pf["name"]) for pf in payload_fields}
            if fn in proc_field_names:
                cmd_mapping.append(f"    {fn}: payload.{fn},")
            else:
                cmd_mapping.append(f"    {fn}: undefined as any, // TODO: map from payload or enriched")

    # Build expected event entries
    event_field_entries = []
    if events:
        for f in events[0].get("fields", []):
            fn = field_name(f["name"])
            event_field_entries.append(f"          {fn}: command.{fn},")

    # Imports
    lines = [
        'import { test, describe } from "node:test";',
    ]
    if has_enrichment:
        lines.append('import assert from "node:assert/strict";')
    lines.extend([
        f'import type {{ {sn} }} from "../command.js";',
        f'import {{ handle{sn} }} from "../commandHandler.js";',
        f'import {{ SliceTester, type TestEvent }} from "#abstractions/slices/SliceTester.js";',
        f'import {stream}StreamFactory from "#BusinessCapabilities/{context}/swimlanes/{stream}/index.js";',
    ])
    if has_enrichment:
        lines.append(f'import {{ enrich }} from "#BusinessCapabilities/{context}/endpoints/{sn}/enrichment.js";')
    lines.extend(["", f'describe("{sn} Slice - Unit Tests", () => {{', ""])

    # Main test: payload → enrich → command → events
    lines.append(f'  test("automation: payload → enrich → command → event", async () => {{')
    lines.append("    // What arrives from Kafka")
    lines.append("    const payload = {")
    lines.extend(payload_entries)
    lines.append("    };")
    lines.append("")

    if has_enrichment:
        lines.append("    // Enrichment step (same as the automation processor does)")
        lines.append("    const enriched = await enrich(payload);")
        lines.append("")

    lines.append(f"    // Build command (same mapping as pg-boss endpoint)")
    lines.append(f"    const command: {sn} = {{")
    lines.extend(cmd_mapping)
    lines.append("    };")
    lines.append("")

    # Expected events
    if events:
        en = event_name_from_title(events[0]["title"], "")
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
        f"      handle{sn},",
        f"      {stream}StreamFactory,",
        "      [],",
        "      command,",
        "      expectedEvents,",
        "    );",
        "  });",
        "",
    ])

    if has_enrichment:
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
                if ft in ("Double", "Integer", "Int", "Decimal", "Float"):
                    lines.append(f'    assert.strictEqual(typeof enriched.{fn}, "number");')
                elif ft in ("DateTime", "Date"):
                    lines.append(f"    assert.ok(enriched.{fn} instanceof Date);")
                else:
                    lines.append(f'    assert.strictEqual(typeof enriched.{fn}, "string");')
        lines.extend([
            "  });",
            "",
        ])

    lines.append("});")
    lines.append("")
    return "\n".join(lines)


def gen_view_state(slice_data: dict, event_id_map: dict[str, str] | None = None) -> str:
    """Generate SliceState view state.ts.

    Derives state shape from spec.given[] event fields — no domain assumptions.
    """
    sn = slice_name_pascal(slice_data)
    view_name = f"SliceState{sn}"
    specs = slice_data.get("specifications", [])

    # Collect all fields from given events (deduplicated, preserving order)
    seen = set()
    given_fields = []
    for spec in specs:
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


def gen_view_handlers(slice_data: dict, event_id_map: dict[str, str] | None = None) -> str:
    """Generate SliceState view handlers.ts.

    Each given event type gets a handler that spreads event fields into state.
    No domain assumptions — just maps event fields to state fields.
    """
    sn = slice_name_pascal(slice_data)
    view_name = f"SliceState{sn}"
    specs = slice_data.get("specifications", [])
    eid_map = event_id_map or {}

    # Collect given event types (deduplicated), resolving via linkedId
    given_events = {}
    for spec in specs:
        for given in spec.get("given", []):
            en = resolve_given_event_name(given, eid_map)
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


def gen_test(slice_data: dict, event_id_map: dict[str, str] | None = None) -> str:
    """Generate command.slice.test.ts."""
    sn = slice_name_pascal(slice_data)
    stream = stream_name(slice_data["context"])
    context = slice_data["context"]
    specs = slice_data.get("specifications", [])
    events = slice_data.get("events", [])
    cmd = slice_data["commands"][0]
    eid_map = event_id_map or {}

    lines = [
        'import { test, describe } from "node:test";',
        f'import type {{ {sn} }} from "../command.js";',
        f'import {{ handle{sn} }} from "../commandHandler.js";',
        f'import {{ SliceTester, type TestEvent }} from "#abstractions/slices/SliceTester.js";',
        f'import {stream}StreamFactory from "#BusinessCapabilities/{context}/swimlanes/{stream}/index.js";',
        "",
        f'describe("{sn} Slice - Unit Tests", () => {{',
    ]

    # Main flow test — use the spec with fewest given events (happy/success path).
    # This avoids the case where the first spec is a rejection that conflicts with
    # the expected success outcome.
    main_spec = min(specs, key=lambda s: len(s.get("given", []))) if specs else None

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
    lines.append(f"    const command: {sn} = {{")
    lines.append(f'      commandType: "{sn}",')
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
        f"      handle{sn},",
        f"      {stream}StreamFactory,",
        "      givenEvents,",
        "      command,",
        "      expectedEvents,",
        "    );",
        "  });",
        "",
    ])

    # Spec tests
    for spec in specs:
        pred_name = "unknown"
        comments = spec.get("comments", [])
        if comments and comments[0].get("description"):
            pred_name = predicate_name(comments[0]["description"])

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
        lines.append(f"    const command: {sn} = {{")
        lines.append(f'      commandType: "{sn}",')
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
            f"      handle{sn},",
            f"      {stream}StreamFactory,",
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


def _format_example(f: dict) -> str:
    """Format a field's example value as TypeScript literal."""
    example = f.get("example", "")
    ft = f.get("type", "String")
    if ft in ("Double", "Integer", "Int"):
        try:
            return str(float(example)) if "." in str(example) else str(int(example))
        except (ValueError, TypeError):
            return "0"
    if ft == "DateTime":
        if not example:
            return 'new Date("2025-01-01T11:00:00Z")'
        # Normalize "YYYY-MM-DD HH:MM" (space separator, no timezone) → ISO UTC
        import re as _re
        if _re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$", example.strip()):
            example = example.strip().replace(" ", "T") + ":00Z"
        return f'new Date("{example}")'
    if ft == "Boolean":
        return "true" if example.lower() in ("true", "1", "yes") else "false"
    # String / UUID
    return f'"{example}"' if example else '""'


def gen_view_test(slice_data: dict, event_id_map: dict[str, str] | None = None) -> str:
    """Generate view.slice.test.ts for SliceState view."""
    sn = slice_name_pascal(slice_data)
    view_name = f"SliceState{sn}"
    state_type = f"{view_name}ViewState"
    specs = slice_data.get("specifications", [])
    eid_map = event_id_map or {}

    # Collect given event types and their fields
    given_events = {}
    for spec in specs:
        for given in spec.get("given", []):
            en = resolve_given_event_name(given, eid_map)
            if en not in given_events:
                given_events[en] = given

    # Collect all state fields for 'then' assertions
    state_fields = []
    seen = set()
    for spec in specs:
        for given in spec.get("given", []):
            for f in given.get("fields", []):
                fn = field_name(f["name"])
                if fn not in seen:
                    seen.add(fn)
                    state_fields.append((fn, f))

    # Collect negative event names (events in spec.then that are not given events)
    negative_events = set()
    for spec in specs:
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


# ──────────────────────────────────────────────────────────────────────
# Automations / routes / projections registry updaters
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



# ──────────────────────────────────────────────────────────────────────
# Stream factory / views type updaters
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


def update_routes(paths: SlicePaths, slice_data: dict) -> str:
    """Update routes.ts to register the new endpoint."""
    sn = slice_name_pascal(slice_data)
    context = slice_data["context"]
    content = paths.routes.read_text() if paths.routes.exists() else ""

    adapter_name = f"create{sn}RestAdapter"
    route_path = kebab_case(sn)

    if adapter_name in content:
        return content

    import_line = f'import {{ {adapter_name} }} from "./{sn}/REST/index.js";'

    if not content:
        return f"""import {{ Router }} from "express";
{import_line}
import type {{ IEvDbStorageAdapter }} from "@eventualize/core/adapters/IEvDbStorageAdapter";

export function create{context}Router(storageAdapter: IEvDbStorageAdapter): Router {{
  const router = Router();

  router.post("/{route_path}", {adapter_name}(storageAdapter));

  return router;
}}
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

    return content


# ──────────────────────────────────────────────────────────────────────
# Auto-normalize helper
# ──────────────────────────────────────────────────────────────────────

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
# Main scaffold function
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

    sn = slice_name_pascal(slice_data)
    stream = stream_name(context)
    events = slice_data.get("events", [])
    specs = slice_data.get("specifications", [])
    has_specs = bool(specs)

    # Build event ID map for resolving spec.given linkedId → actual event names
    event_id_map = build_event_id_map(root, context)

    paths = SlicePaths(root, context, sn, stream)
    files_created = []
    files_updated = []

    def write_file(path: Path, content: str, is_update: bool = False):
        if dry_run:
            (files_updated if is_update else files_created).append(str(path.relative_to(root)))
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        (files_updated if is_update else files_created).append(str(path.relative_to(root)))

    # Detect enrichment-only slice (processor + backendPrompts, no commands)
    is_enrichment = has_backend_prompts(slice_data) and not slice_data.get("commands")

    if is_enrichment:
        # ── Enrichment-only slice: generate enrichment.ts + test ────────
        enrichment_dir = paths.bc / "endpoints" / sn
        enrichment_path = enrichment_dir / "enrichment.ts"
        if not enrichment_path.exists():
            write_file(enrichment_path, gen_enrichment(slice_data))

        enrichment_test_path = enrichment_dir / "tests" / "enrichment.test.ts"
        if not enrichment_test_path.exists():
            write_file(enrichment_test_path, gen_enrichment_test(slice_data))

    else:
        # ── Standard slice: command → events → views pipeline ───────────

        # 1. Event interfaces
        for event in events:
            en = event_name_from_title(event["title"], "")
            event_path = paths.event_file(en)
            if not event_path.exists():
                write_file(event_path, gen_event_interface(event))

        # 2. SliceState view (always when has_specs — gwts.ts and commandHandler.ts always reference it)
        view_name_str = ""
        if has_specs:
            view_name_str = f"SliceState{sn}"
            state_path = paths.view_state(view_name_str)
            handlers_path = paths.view_handlers(view_name_str)
            if not state_path.exists():
                write_file(state_path, gen_view_state(slice_data))
            if not handlers_path.exists():
                write_file(handlers_path, gen_view_handlers(slice_data))
            # View test skeleton
            view_test_path = paths.view_test(view_name_str)
            if not view_test_path.exists():
                write_file(view_test_path, gen_view_test(slice_data, event_id_map))

        has_commands = bool(slice_data.get("commands"))

        # 3. Command (only if slice has commands)
        if has_commands:
            cmd_path = paths.slice_dir / "command.ts"
            if not cmd_path.exists():
                write_file(cmd_path, gen_command(slice_data))

        # 4. GWTS (only if specs)
        if has_specs:
            gwts_path = paths.slice_dir / "gwts.ts"
            if not gwts_path.exists():
                write_file(gwts_path, gen_gwts(slice_data))

        # 5. Command handler (only if slice has commands)
        if has_commands:
            handler_path = paths.slice_dir / "commandHandler.ts"
            if not handler_path.exists():
                write_file(handler_path, gen_command_handler(slice_data))

        # 6. Adapter (only if slice has commands)
        if has_commands:
            adapter_path = paths.slice_dir / "adapter.ts"
            if not adapter_path.exists():
                write_file(adapter_path, gen_adapter(slice_data))

        # 7. Endpoint (REST or pg-boss depending on pattern; only if slice has commands)
        if has_commands:
            is_automation = is_automation_slice(slice_data)
            if is_automation:
                endpoint_path = paths.pgboss_endpoint_dir / "index.ts"
                if not endpoint_path.exists():
                    write_file(endpoint_path, gen_pgboss_endpoint(slice_data))

                # 7a. Enrichment file for automation slices with generated fields + description
                trigger = get_trigger_info(slice_data)
                has_enrichment_fields = any(f.get("generated") for f in trigger.get("payload_fields", []))
                has_enrichment_desc = bool(trigger.get("description"))
                if has_enrichment_fields and has_enrichment_desc:
                    enrichment_path = paths.bc / "endpoints" / sn / "enrichment.ts"
                    if not enrichment_path.exists():
                        write_file(enrichment_path, gen_enrichment(slice_data))
                    enrichment_test_path = paths.bc / "endpoints" / sn / "tests" / "enrichment.test.ts"
                    if not enrichment_test_path.exists():
                        write_file(enrichment_test_path, gen_enrichment_test(slice_data))

                # 7b. Automation endpoint test
                auto_test_path = paths.bc / "endpoints" / sn / "tests" / "automation.endpoint.test.ts"
                if not auto_test_path.exists():
                    write_file(auto_test_path, gen_automation_endpoint_test(slice_data))
            else:
                endpoint_path = paths.rest_endpoint_dir / "index.ts"
                if not endpoint_path.exists():
                    write_file(endpoint_path, gen_rest_endpoint(slice_data))

        # 8. Tests (only if slice has commands)
        if has_commands:
            test_path = paths.tests_dir / "command.slice.test.ts"
            if not test_path.exists():
                if is_automation_slice(slice_data):
                    write_file(test_path, gen_automation_slice_test(slice_data))
                else:
                    write_file(test_path, gen_test(slice_data))

    # 9-11: Stream factory, views type, routes (skip for enrichment-only slices)
    if not is_enrichment:
        view_name_str = view_name_str if 'view_name_str' in dir() else ""

        # 9. Update stream factory (create minimal one if missing)
        if not paths.stream_factory.exists():
            if not dry_run:
                paths.stream_factory.parent.mkdir(parents=True, exist_ok=True)
            write_file(paths.stream_factory, gen_stream_factory(slice_data))
        if paths.stream_factory.exists():
            updated = update_stream_factory(paths, slice_data, events, view_name_str)
            if updated != paths.stream_factory.read_text():
                write_file(paths.stream_factory, updated, is_update=True)

        # 10. Update views type
        if view_name_str:
            updated = update_views_type(paths, slice_data, view_name_str)
            existing = paths.views_type.read_text() if paths.views_type.exists() else ""
            if updated != existing:
                write_file(paths.views_type, updated, is_update=True)

        # 11. Update routes (REST only — automation slices don't have routes)
        is_automation = is_automation_slice(slice_data)
        if not is_automation and paths.routes.exists():
            updated = update_routes(paths, slice_data)
            if updated != paths.routes.read_text():
                write_file(paths.routes, updated, is_update=True)

    # 11b. Update per-context automations.ts (automation slices only)
    # Discovery at startup dynamically imports all automations.ts files,
    # so no central registry needs updating — just the per-context file.
    if not is_enrichment and is_automation_slice(slice_data) and not dry_run:
        automations_path = paths.bc / "endpoints" / "automations.ts"
        updated = update_context_automations(paths, slice_data, sn)
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
        _gen_todo_context(paths, slice_data, sn, stream, event_id_map, files_created, files_updated)

    # 14. Auto-normalize: keep .eventmodel/.normalized/ in sync after scaffolding
    if not dry_run:
        _auto_normalize(root, slice_json_path)

    return {
        "slice": sn,
        "folder": folder,
        "context": context,
        "files_created": files_created,
        "files_updated": files_updated,
        "total_files": len(files_created) + len(files_updated),
        "dry_run": dry_run,
    }


def _gen_todo_context(paths: SlicePaths, slice_data: dict, sn: str, stream: str,
                      event_id_map: dict[str, str] | None, files_created: list, files_updated: list) -> None:
    """Generate TODO_CONTEXT.md — a single file the AI reads instead of many separate reads.

    Contains: slice summary, files with TODOs, spec details, backend prompts, and patterns.
    This eliminates the need for the AI to read slice.json, reference files, or existing code.
    """
    specs = slice_data.get("specifications", [])
    events = slice_data.get("events", [])
    cmd = slice_data["commands"][0] if slice_data.get("commands") else {}
    context = slice_data["context"]
    eid_map = event_id_map or {}
    is_enrichment = has_backend_prompts(slice_data) and not slice_data.get("commands")
    # Get backend prompts from slice-level or processor descriptions
    backend_prompts = slice_data.get("codeGen", {}).get("backendPrompts", [])
    if not backend_prompts:
        for proc in slice_data.get("processors", []):
            if proc.get("type") == "AUTOMATION" and proc.get("description"):
                backend_prompts.append(proc["description"])

    lines = [
        f"# TODO Context for {sn}",
        "",
        f"Slice: {sn} | Context: {context} | Stream: {stream}",
    ]

    if is_enrichment:
        lines.append(f"Type: **Enrichment Processor** (backendPrompts-driven)")

    # Automation trigger info (for slices with AUTOMATION processors)
    is_automation = is_automation_slice(slice_data)
    if is_automation:
        trigger = get_trigger_info(slice_data)
        trigger_source = trigger.get("source", "event")
        if trigger.get("trigger_event"):
            lines.append(f"Trigger: **{trigger['trigger_event']}** event via Kafka CDC (source: `{trigger_source}`)")
            lines.append(f"Kafka topic: `{trigger.get('kafka_topic', 'events.' + pascal_case(trigger['trigger_event']))}`")
        elif trigger.get("trigger_readmodel"):
            lines.append(f"Trigger: **{trigger['trigger_readmodel']}** readmodel via outbox (source: `{trigger_source}`)")

    lines.extend(["", "## Files with TODOs (only edit these)", ""])

    # List files that need AI work
    todo_files = []
    if is_enrichment:
        todo_files.append(f"- `endpoints/{sn}/enrichment.ts` — implement enrichment logic per backendPrompts below")
        todo_files.append(f"- `endpoints/{sn}/tests/enrichment.test.ts` — verify enrichment output")
    else:
        if specs:
            todo_files.append(f"- `slices/{sn}/gwts.ts` — fill in predicate conditions")
        todo_files.append(f"- `slices/{sn}/commandHandler.ts` — fill in computed event fields")
        if is_automation:
            trigger = get_trigger_info(slice_data)
            if any(f.get("generated") for f in trigger.get("payload_fields", [])) and trigger.get("description"):
                todo_files.append(f"- `endpoints/{sn}/enrichment.ts` — implement enrichment logic per description below")
                todo_files.append(f"- `endpoints/{sn}/tests/enrichment.test.ts` — verify enrichment output")
            todo_files.append(f"- `endpoints/{sn}/tests/automation.endpoint.test.ts` — verify endpoint identity and mapping")
        if specs:
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
        info = get_enrichment_info(slice_data)
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
    else:
        # Standard slice patterns
        # Spec details — the AI needs these to fill TODOs
        if specs:
            lines.append("## Specifications (GWT)")
            lines.append("")
            for spec in specs:
                pred_name = "unknown"
                comments = spec.get("comments", [])
                if comments and comments[0].get("description"):
                    pred_name = predicate_name(comments[0]["description"])

                title = spec.get("title", pred_name)
                lines.append(f"### {title}")
                lines.append(f"Predicate: `{pred_name}`")

                # Given
                given_list = spec.get("given", [])
                if given_list:
                    lines.append("**Given** (prior events in stream):")
                    for g in given_list:
                        en = resolve_given_event_name(g, eid_map)
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
        for event in events:
            en = event_name_from_title(event["title"], "")
            cmd_field_names = {field_name(f["name"]) for f in cmd.get("fields", [])}
            for f in event.get("fields", []):
                fn = field_name(f["name"])
                if fn not in cmd_field_names:
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
        lines.append("### Other patterns")
        lines.append("- `commandHandler.ts`: pure function, only `stream.appendEvent*()` calls, no I/O")
        lines.append("- `gwts.ts`: `(state, command) => boolean` — compare state fields vs command fields")
        lines.append("- View handlers: `(state, event) => ({ ...state, field: event.field })`")
        lines.append("- Tests use `SliceTester.testCommandHandler()` and `ViewSliceTester.run()`")
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
