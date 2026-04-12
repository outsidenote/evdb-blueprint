#!/usr/bin/env python3
"""
evdb-diff: Deterministic 5-pass audit of event model slices against codebase.

Usage:
  python3 evdb_diff.py [--root <project-root>] [--verbose]

Reads .eventmodel/.slices/index.json, scans src/BusinessCapabilities/ for
implementations, and updates slice statuses. Outputs a JSON action list.
"""

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any


def to_pascal_case(title: str) -> str:
    """Convert "Funds Withdrawal Approved" to "FundsWithdrawalApproved".
    If the title has no spaces (already PascalCase like "LoanAddedToPortfolio"),
    return it as-is to avoid .capitalize() lowercasing interior capitals.
    """
    words = title.split()
    if len(words) == 1:
        return words[0]
    return "".join(word.capitalize() for word in words)


def fuzzy_match(a: str, b: str) -> bool:
    """Case-insensitive fuzzy match: accept if one starts with the other or differ by ≤1 char."""
    al, bl = a.lower(), b.lower()
    if al == bl:
        return True
    if al.startswith(bl) or bl.startswith(al):
        return True
    # Differ by at most 1 character (same length)
    if len(al) == len(bl):
        diffs = sum(1 for ca, cb in zip(al, bl) if ca != cb)
        return diffs <= 1
    # Differ by at most 1 character (off by one length)
    if abs(len(al) - len(bl)) == 1:
        longer, shorter = (al, bl) if len(al) > len(bl) else (bl, al)
        i = j = diffs = 0
        while i < len(longer) and j < len(shorter):
            if longer[i] != shorter[j]:
                diffs += 1
                i += 1
            else:
                i += 1
                j += 1
        return diffs <= 1
    return False


def normalize_for_hash(obj: Any) -> Any:
    """
    Recursively normalize a JSON structure so that reordering of array elements
    does not change the hash. Arrays of dicts are sorted by 'name', 'id', or 'title'
    (first available). Primitive arrays are sorted directly.
    """
    if isinstance(obj, dict):
        return {k: normalize_for_hash(v) for k, v in sorted(obj.items())}
    elif isinstance(obj, list):
        normalized = [normalize_for_hash(item) for item in obj]
        if not normalized:
            return normalized
        if isinstance(normalized[0], dict):
            # Sort by stable key: name > id > title
            for key in ("name", "id", "title"):
                if key in normalized[0]:
                    return sorted(normalized, key=lambda x: str(x.get(key, "")))
            # No stable key found — sort by serialized form as fallback
            return sorted(normalized, key=lambda x: json.dumps(x, sort_keys=True))
        else:
            # Primitive list — sort directly
            try:
                return sorted(normalized)
            except TypeError:
                return normalized
    else:
        return obj


def compute_slice_hash(config_path: Path, slice_id: str) -> str | None:
    """Compute MD5 hash of a slice's config entry (excluding volatile fields).

    Normalizes array ordering so that field/event/spec reordering in Miro
    does not produce false positive drift detection.
    """
    with open(config_path) as f:
        config = json.load(f)

    excluded = {"status", "index"}
    for s in config.get("slices", []):
        if s.get("id") == slice_id:
            spec = {k: v for k, v in s.items() if k not in excluded}
            normalized = normalize_for_hash(spec)
            return hashlib.md5(
                json.dumps(normalized, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
    return None


def read_file_content(path: Path) -> str:
    """Read file content, return empty string if not found."""
    try:
        return path.read_text()
    except FileNotFoundError:
        return ""


def find_with_messages(stream_factory_content: str) -> dict[str, str]:
    """
    Parse .withMessages("EventType", functionName) calls from stream factory.
    Returns {event_type: function_name}.
    """
    pattern = r'\.withMessages\(\s*"(\w+)"\s*,\s*(\w+)\s*\)'
    return dict(re.findall(pattern, stream_factory_content))


def find_message_type(messages_dir: Path, function_name: str) -> str | None:
    """
    Find the message type string from EvDbMessage.createFromMetadata(metadata, "TYPE", ...)
    in the messages file that exports the given function.
    """
    for ts_file in messages_dir.glob("*.ts"):
        content = ts_file.read_text()
        if function_name in content:
            match = re.search(
                r'EvDbMessage\.createFromMetadata\(\s*\w+\s*,\s*"(\w+)"',
                content,
            )
            if match:
                return match.group(1)
    return None


def has_idempotency(messages_dir: Path, function_name: str) -> bool:
    """Check if the messages function uses createIdempotencyMessageFromMetadata."""
    for ts_file in messages_dir.glob("*.ts"):
        content = ts_file.read_text()
        if function_name in content and "createIdempotencyMessageFromMetadata" in content:
            return True
    return False


def run_diff(root: Path, verbose: bool = False) -> dict:
    """Run all 5 passes and return results."""

    eventmodel = root / ".eventmodel"
    slices_dir = eventmodel / ".slices"
    index_path = slices_dir / "index.json"
    config_path = eventmodel / "config.json"
    hashes_path = eventmodel / "implementation-hashes.json"
    src = root / "src" / "BusinessCapabilities"

    # Load index
    with open(index_path) as f:
        index_data = json.load(f)

    slices = index_data.get("slices", [])

    # Load existing hashes
    stored_hashes: dict[str, str] = {}
    if hashes_path.exists():
        with open(hashes_path) as f:
            stored_hashes = json.load(f)

    # Pre-pass: record originally blocked slices
    originally_blocked = [s for s in slices if s.get("status") == "Blocked"]

    # Track results
    log: list[str] = []
    actions: list[dict] = []
    warnings: list[dict] = []
    new_hashes = dict(stored_hashes)

    def vlog(msg: str):
        if verbose:
            print(f"  {msg}", file=sys.stderr)
        log.append(msg)

    # ================================================================
    # PASS 1: Direct implementation scan
    # ================================================================
    vlog("--- Pass 1: Direct implementation scan ---")

    for s in slices:
        if s.get("status") == "Done":
            vlog(f"  {s['folder']}: Done (skipped)")
            continue

        context = s.get("context", "")
        folder = s.get("folder", "")

        # Skip non-implementable slices: TODO list read models and standalone processors
        slice_json_path = root / ".eventmodel" / ".slices" / context / folder / "slice.json"
        if slice_json_path.exists():
            try:
                _sd = json.load(open(slice_json_path))
                _stype = _sd.get("sliceType", "")
                # UNDEFINED slices (standalone processor fragments) — not implementable
                if _stype == "UNDEFINED":
                    s["status"] = "Done"
                    vlog(f"  {folder}: skipped (UNDEFINED slice type)")
                    continue
                # TODO list read models (automation work queues) — handled by pg-boss
                if _stype == "STATE_VIEW" and any(
                    rm.get("todoList") for rm in _sd.get("readmodels", [])
                ):
                    s["status"] = "Done"
                    vlog(f"  {folder}: skipped (TODO list for automation)")
                    continue
            except Exception:
                pass

        context_dir = src / context

        if not context_dir.is_dir():
            s["status"] = "Planned"
            vlog(f"  {folder}: Planned (context dir missing)")
            continue

        slices_code_dir = context_dir / "slices"
        found = False
        if slices_code_dir.is_dir():
            for d in slices_code_dir.iterdir():
                if d.is_dir() and d.name.lower() == folder.lower():
                    # Only count as found if there are actual .ts implementation files
                    has_ts = any(f.suffix == ".ts" for f in d.rglob("*") if f.is_file() and f.name != "TODO_CONTEXT.md")
                    if has_ts:
                        found = True
                    break

        if found:
            if s.get("status") != "Review":
                vlog(f"  {folder}: Planned → Review (dir found)")
            else:
                vlog(f"  {folder}: Review (unchanged)")
            s["status"] = "Review"
        else:
            if s.get("status") != "Planned":
                vlog(f"  {folder}: → Planned (no dir)")
            else:
                vlog(f"  {folder}: Planned (no dir)")
            s["status"] = "Planned"

    # ================================================================
    # PASS 2: Todo-list implicit scan
    # ================================================================
    vlog("--- Pass 2: Todo-list implicit scan ---")

    for s in slices:
        if s.get("status") != "Planned":
            continue

        context = s.get("context", "")
        folder = s.get("folder", "")
        slice_json_path = slices_dir / context / folder / "slice.json"

        if not slice_json_path.exists():
            vlog(f"  {folder}: no slice.json (skipped)")
            continue

        with open(slice_json_path) as f:
            slice_def = json.load(f)

        readmodels = slice_def.get("readmodels", [])
        commands = slice_def.get("commands", [])

        # Must have exactly 1 readmodel, no commands
        if len(readmodels) != 1 or commands:
            vlog(f"  {folder}: not a todo-list slice (skipped)")
            continue

        rm = readmodels[0]
        deps = rm.get("dependencies", [])
        has_inbound_event = any(
            d.get("type") == "INBOUND" and d.get("elementType") == "EVENT"
            for d in deps
        )
        has_outbound_automation = any(
            d.get("type") == "OUTBOUND" and d.get("elementType") == "AUTOMATION"
            for d in deps
        )

        if not (has_inbound_event and has_outbound_automation):
            vlog(f"  {folder}: not a todo-list shape (skipped)")
            continue

        # Extract triggering event type
        inbound_event = next(
            d for d in deps
            if d.get("type") == "INBOUND" and d.get("elementType") == "EVENT"
        )
        event_type = to_pascal_case(inbound_event.get("title", ""))

        # Search for queue-message producer
        context_src = src / context
        found_producer = False
        if context_src.is_dir():
            for ts_file in context_src.rglob("*.ts"):
                try:
                    content = ts_file.read_text()
                except Exception:
                    continue
                if "createPgBossQueueMessageFromMetadata" in content and event_type in content:
                    found_producer = True
                    vlog(f"  {folder}: Planned → Review (queue-message found for {event_type} in {ts_file.name})")
                    break

        if found_producer:
            s["status"] = "Review"
        else:
            vlog(f"  {folder}: no queue-message producer found for {event_type}")

    # ================================================================
    # PASS 3: Automation-processor implicit scan
    # ================================================================
    vlog("--- Pass 3: Automation-processor implicit scan ---")

    for s in slices:
        if s.get("status") != "Planned":
            continue

        context = s.get("context", "")
        folder = s.get("folder", "")
        slice_json_path = slices_dir / context / folder / "slice.json"

        if not slice_json_path.exists():
            vlog(f"  {folder}: no slice.json (skipped)")
            continue

        with open(slice_json_path) as f:
            slice_def = json.load(f)

        commands = slice_def.get("commands", [])
        processors = slice_def.get("processors", [])

        # Must have empty commands and at least one processor with OUTBOUND COMMAND
        if commands or not processors:
            vlog(f"  {folder}: not an automation-processor (skipped)")
            continue

        outbound_commands = []
        for proc in processors:
            for dep in proc.get("dependencies", []):
                if dep.get("type") == "OUTBOUND" and dep.get("elementType") == "COMMAND":
                    outbound_commands.append(dep.get("title", ""))

        if not outbound_commands:
            vlog(f"  {folder}: no outbound commands (skipped)")
            continue

        # Check for pg-boss endpoints
        endpoints_dir = src / context / "endpoints"
        if not endpoints_dir.is_dir():
            vlog(f"  {folder}: no endpoints dir")
            continue

        found_endpoint = False
        for cmd_title in outbound_commands:
            cmd_pascal = to_pascal_case(cmd_title)
            for ep_dir in endpoints_dir.iterdir():
                if not ep_dir.is_dir():
                    continue
                pgboss_file = ep_dir / "pg-boss" / "index.ts"
                if pgboss_file.exists() and fuzzy_match(ep_dir.name, cmd_pascal):
                    found_endpoint = True
                    vlog(f"  {folder}: Planned → Review (pg-boss endpoint found at {ep_dir.name})")
                    break
            if found_endpoint:
                break

        if found_endpoint:
            s["status"] = "Review"
        else:
            vlog(f"  {folder}: no matching pg-boss endpoint")

    # ================================================================
    # PASS 4: Hash integrity check
    # ================================================================
    vlog("--- Pass 4: Hash integrity check ---")

    for s in slices:
        status = s.get("status", "")
        folder = s.get("folder", "")
        slice_id = s.get("id", "")
        context = s.get("context", "")

        if status == "Done":
            vlog(f"  {folder}: Done (skipped)")
            continue

        if status == "Planned":
            vlog(f"  {folder}: Planned (nothing to do)")
            continue

        # Only Review slices get checked
        has_stored_hash = slice_id in stored_hashes

        # 4a: Spec drift (has stored hash)
        if has_stored_hash:
            current_hash = compute_slice_hash(config_path, slice_id)
            if current_hash and current_hash != stored_hashes[slice_id]:
                s["status"] = "Blocked"
                vlog(f"  {folder}: Review → Blocked (spec drift: hash mismatch)")
                actions.append({
                    "slice": s.get("slice", ""),
                    "folder": folder,
                    "action": "re-implement",
                    "reason": "Spec hash drift detected",
                })
                continue
            else:
                vlog(f"  {folder}: hash matches (no drift)")
                continue

        # 4b: Unverified implementation (Review but no hash)
        slice_json_path = slices_dir / context / folder / "slice.json"
        if not slice_json_path.exists():
            # Implicit slice (todo-list or automation) — treat as verified
            current_hash = compute_slice_hash(config_path, slice_id)
            if current_hash:
                new_hashes[slice_id] = current_hash
                vlog(f"  {folder}: implicit slice, hash stamped")
            continue

        with open(slice_json_path) as f:
            slice_def = json.load(f)

        slice_type = slice_def.get("sliceType", "")

        # Check if this slice was set to Review by Pass 2 (todo-list) or Pass 3 (automation)
        # These are implicit slices with a slice.json but no dedicated code directory.
        # Their wiring was already verified in the earlier pass — treat as verified.
        has_code_dir = False
        slices_code_dir = src / context / "slices"
        if slices_code_dir.is_dir():
            for d in slices_code_dir.iterdir():
                if d.is_dir() and d.name.lower() == folder.lower():
                    has_code_dir = True
                    break

        if not has_code_dir:
            # No code directory but status is Review — must have been set by Pass 2 or 3
            current_hash = compute_slice_hash(config_path, slice_id)
            if current_hash:
                new_hashes[slice_id] = current_hash
                vlog(f"  {folder}: implicit slice (no code dir), hash stamped")
            continue

        verified = True
        verification_notes: list[str] = []

        if slice_type == "STATE_CHANGE" or slice_def.get("commands"):
            # Check commands exist in slices/ — match by BOTH command title AND slice folder name
            for cmd in slice_def.get("commands", []):
                cmd_pascal = to_pascal_case(cmd.get("title", ""))
                cmd_dir = src / context / "slices"
                found = False
                if cmd_dir.is_dir():
                    for d in cmd_dir.iterdir():
                        if d.is_dir() and (
                            fuzzy_match(d.name, cmd_pascal) or
                            d.name.lower() == folder.lower()
                        ):
                            found = True
                            break
                if not found:
                    verified = False
                    verification_notes.append(f"Command {cmd_pascal} not found in slices/")

            # Check internal events exist in swimlanes
            swimlanes_dir = src / context / "swimlanes"
            stream_factory_content = ""
            if swimlanes_dir.is_dir():
                for sf in swimlanes_dir.rglob("index.ts"):
                    stream_factory_content = sf.read_text()
                    break

            # STRICT: internal events must have exact match in stream factory
            # (withEvent or withMessages). No variant/fuzzy matching for STATE_CHANGE.
            for evt in slice_def.get("events", []):
                elem_context = evt.get("elementContext", "INTERNAL")
                if elem_context == "EXTERNAL":
                    continue  # External events don't need to be in stream factory

                evt_pascal = to_pascal_case(evt.get("title", ""))

                if f'"{evt_pascal}"' in stream_factory_content:
                    verification_notes.append(f"Event {evt_pascal} found in stream factory")
                else:
                    verified = False
                    verification_notes.append(
                        f"INTERNAL event {evt_pascal} missing from stream factory (exact match required for STATE_CHANGE)"
                    )

        elif slice_type == "STATE_VIEW":
            # Projection slice — follow the message chain
            swimlanes_dir = src / context / "swimlanes"
            stream_factory_content = ""
            messages_dir = None

            if swimlanes_dir.is_dir():
                for sf in swimlanes_dir.rglob("index.ts"):
                    stream_factory_content = sf.read_text()
                    messages_dir = sf.parent / "messages"
                    break

            with_messages_map = find_with_messages(stream_factory_content)

            for rm in slice_def.get("readmodels", []):
                for dep in rm.get("dependencies", []):
                    if dep.get("type") != "INBOUND" or dep.get("elementType") != "EVENT":
                        continue

                    evt_pascal = to_pascal_case(dep.get("title", ""))

                    # Step 1: Find messages function for this event
                    msg_func = with_messages_map.get(evt_pascal)

                    # Try plausible variant if exact not found
                    if not msg_func:
                        for registered_evt, func in with_messages_map.items():
                            if (evt_pascal.startswith(registered_evt) or
                                registered_evt.startswith(evt_pascal)):
                                msg_func = func
                                verification_notes.append(
                                    f"Event {evt_pascal} matched via variant {registered_evt}"
                                )
                                break

                    if not msg_func:
                        verified = False
                        verification_notes.append(
                            f"No withMessages for event {evt_pascal} or variant"
                        )
                        continue

                    # Step 2: Find actual message type string
                    if messages_dir and messages_dir.is_dir():
                        message_type = find_message_type(messages_dir, msg_func)
                    else:
                        message_type = None

                    if not message_type:
                        verified = False
                        verification_notes.append(
                            f"No EvDbMessage.createFromMetadata found for {msg_func}"
                        )
                        continue

                    # Step 3: Check projection code for message type
                    slice_code_dir = src / context / "slices"
                    found_in_projection = False
                    if slice_code_dir.is_dir():
                        for d in slice_code_dir.iterdir():
                            if d.is_dir() and d.name.lower() == folder.lower():
                                for ts_file in d.rglob("*.ts"):
                                    try:
                                        content = ts_file.read_text()
                                    except Exception:
                                        continue
                                    if message_type in content:
                                        found_in_projection = True
                                        break
                                break

                    if found_in_projection:
                        verification_notes.append(
                            f"Message type {message_type} found in projection"
                        )
                    else:
                        verified = False
                        verification_notes.append(
                            f"Message type {message_type} NOT found in projection code"
                        )

                    # Step 4: Check idempotency alignment (warning only)
                    if messages_dir and messages_dir.is_dir():
                        uses_idempotency = has_idempotency(messages_dir, msg_func)
                        if uses_idempotency:
                            # Check if projection uses Idempotent mode
                            proj_uses_idempotent = False
                            if slice_code_dir.is_dir():
                                for d in slice_code_dir.iterdir():
                                    if d.is_dir() and d.name.lower() == folder.lower():
                                        for ts_file in d.rglob("*.ts"):
                                            try:
                                                content = ts_file.read_text()
                                            except Exception:
                                                continue
                                            if "ProjectionModeType.Idempotent" in content:
                                                proj_uses_idempotent = True
                                                break
                                        break

                            if not proj_uses_idempotent:
                                warnings.append({
                                    "folder": folder,
                                    "warning": f"Idempotency mismatch: messages use createIdempotencyMessageFromMetadata but projection does not use ProjectionModeType.Idempotent",
                                })
                                verification_notes.append(
                                    "WARNING: idempotency mismatch (not a blocker)"
                                )

        if verified:
            current_hash = compute_slice_hash(config_path, slice_id)
            if current_hash:
                new_hashes[slice_id] = current_hash
            vlog(f"  {folder}: verified, hash stamped ({'; '.join(verification_notes)})")
        else:
            s["status"] = "Blocked"
            # Build human-readable explanation and recommendation
            missing = [n for n in verification_notes if not n.startswith("WARNING") and ("missing" in n.lower() or "not found" in n.lower())]
            found = [n for n in verification_notes if not n.startswith("WARNING") and ("found" in n.lower() or "matched" in n.lower())]

            explanation = f"Slice '{s.get('slice', folder)}' is Blocked."
            if missing:
                explanation += f" Missing: {'; '.join(missing)}."
            if found:
                explanation += f" Found: {'; '.join(found)}."

            recommendation = "Either update the event model spec to match the code, or update the code to match the spec."
            if any("stream factory" in n for n in missing):
                recommendation = "The event model defines an internal event that doesn't exist in the stream factory. Either: (1) add the event to the stream factory with .withEvent(), or (2) update the event model title to match the event name used in the code."
            elif any("not found in slices" in n for n in missing):
                recommendation = "The command handler directory is missing. Run evdb-dev to implement this slice."
            elif any("NOT found in projection" in n for n in missing):
                recommendation = "The projection doesn't handle the expected message type. Check the messages file for the correct message type string and add a handler in the projection."

            vlog(f"  {folder}: Review → Blocked ({'; '.join(verification_notes)})")
            actions.append({
                "slice": s.get("slice", ""),
                "folder": folder,
                "action": "review",
                "reason": "; ".join(n for n in verification_notes if not n.startswith("WARNING")),
                "explanation": explanation,
                "recommendation": recommendation,
            })

    # ================================================================
    # PASS 5: Blocked slice review
    # ================================================================
    vlog("--- Pass 5: Blocked slice review ---")

    for blocked in originally_blocked:
        folder = blocked.get("folder", "")
        slice_id = blocked.get("id", "")

        # Find current status
        current = next((s for s in slices if s["id"] == slice_id), None)
        if not current:
            vlog(f"  {folder}: originally Blocked, no longer in index")
            continue

        current_status = current.get("status", "")

        if current_status == "Review":
            vlog(f"  {folder}: Blocked → Review (resolved — code verified in Pass 4)")
        elif current_status == "Blocked":
            had_hash = slice_id in stored_hashes
            if had_hash:
                vlog(f"  {folder}: still Blocked (spec drift)")
            else:
                vlog(f"  {folder}: still Blocked (missing identifiers)")
        elif current_status == "Planned":
            vlog(f"  {folder}: Blocked → Planned (code removed)")
        else:
            vlog(f"  {folder}: Blocked → {current_status}")

    if not originally_blocked:
        vlog("  No originally Blocked slices.")

    # ================================================================
    # Build actions for Planned slices
    # ================================================================
    for s in slices:
        if s.get("status") == "Planned":
            # Check if it's already in actions
            if not any(a["folder"] == s["folder"] for a in actions):
                actions.append({
                    "slice": s.get("slice", ""),
                    "folder": s.get("folder", ""),
                    "action": "implement",
                    "reason": "No implementation found",
                    "explanation": f"Slice '{s.get('slice', s['folder'])}' has no implementation code. It needs to be built from scratch.",
                    "recommendation": "Run evdb-dev to implement this slice. It will read the slice definition from .eventmodel/ and generate all required artifacts.",
                })

    # ================================================================
    # Write outputs
    # ================================================================

    # Write updated index.json
    with open(index_path, "w") as f:
        json.dump(index_data, f, indent=2)
        f.write("\n")

    # Write hashes
    if new_hashes:
        with open(hashes_path, "w") as f:
            json.dump(dict(sorted(new_hashes.items())), f, indent=2)
            f.write("\n")

    # Build result
    result = {
        "statuses": {s["folder"]: s["status"] for s in slices},
        "actions": actions,
        "warnings": warnings,
        "log": log,
    }

    return result


def main():
    parser = argparse.ArgumentParser(description="evdb-diff: audit event model against codebase")
    parser.add_argument("--root", default=".", help="Project root directory")
    parser.add_argument("--verbose", action="store_true", help="Print progress to stderr")
    parser.add_argument("--json", action="store_true", help="Output JSON result to stdout")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    result = run_diff(root, verbose=args.verbose)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        # Human-readable summary
        print("\nSlice Statuses:")
        for folder, status in result["statuses"].items():
            print(f"  {folder}: {status}")

        if result["actions"]:
            print("\nActions:")
            for a in result["actions"]:
                print(f"  [{a['action']}] {a['folder']}: {a['reason']}")

        if result["warnings"]:
            print("\nWarnings:")
            for w in result["warnings"]:
                print(f"  ⚠ {w['folder']}: {w['warning']}")

        # Summary counts
        statuses = result["statuses"]
        counts = {}
        for status in statuses.values():
            counts[status] = counts.get(status, 0) + 1
        print(f"\nSummary: {counts}")


if __name__ == "__main__":
    main()
