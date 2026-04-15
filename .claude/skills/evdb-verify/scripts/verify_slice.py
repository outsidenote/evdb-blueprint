#!/usr/bin/env python3
"""
verify_slice.py — Contract verifier for evdb slices.

Compares generated TypeScript files against the normalized spec
(.normalized.json). Uses grep-based checks — no TypeScript AST parsing.

Exit codes:
  0 — all checks PASS or WARN
  1 — one or more FAIL or MISSING

Usage:
    python3 verify_slice.py <normalized.json> [--src <src_root>]
    python3 verify_slice.py --all --root <repo_root>
    python3 verify_slice.py --all --root <repo_root> --json
"""

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------

PASS = "PASS"
WARN = "WARN"
FAIL = "FAIL"
MISSING = "MISSING"


@dataclass
class Check:
    file: str
    check: str
    status: str
    detail: str = ""


@dataclass
class SliceReport:
    slice_name: str
    normalized_path: str
    checks: list[Check] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return all(c.status in (PASS, WARN) for c in self.checks)

    @property
    def fail_count(self) -> int:
        return sum(1 for c in self.checks if c.status in (FAIL, MISSING))

    @property
    def warn_count(self) -> int:
        return sum(1 for c in self.checks if c.status == WARN)


# ---------------------------------------------------------------------------
# Source path resolution
# ---------------------------------------------------------------------------

def src_paths(norm: dict, src_root: Path) -> dict:
    context = norm["slice"]["context"]
    cmd_class = norm["naming"]["commandClassName"]
    stream = context  # stream = context by convention

    # view.viewName already uses commandClassName (normalizer aligns with scaffold convention)
    view_name = norm["view"]["viewName"]

    bc = src_root / "src" / "BusinessCapabilities" / context
    slices = bc / "slices" / cmd_class
    swimlane = bc / "swimlanes" / stream

    return {
        "command": slices / "command.ts",
        "adapter": slices / "adapter.ts",
        "gwts": slices / "gwts.ts",
        "commandHandler": slices / "commandHandler.ts",
        "test": slices / "tests" / "command.slice.test.ts",
        "view_state": swimlane / "views" / view_name / "state.ts",
        "view_handlers": swimlane / "views" / view_name / "handlers.ts",
        "events": {
            ev["className"]: swimlane / "events" / f"{ev['className']}.ts"
            for ev in norm["events"]
        },
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def read(path: Path) -> str | None:
    try:
        return path.read_text()
    except FileNotFoundError:
        return None


def grep(content: str, pattern: str, flags: int = 0) -> bool:
    return bool(re.search(pattern, content, flags))


def add(report: SliceReport, file: str, check: str, status: str, detail: str = ""):
    report.checks.append(Check(file=file, check=check, status=status, detail=detail))


# ---------------------------------------------------------------------------
# Per-file checks
# ---------------------------------------------------------------------------

def check_command(norm: dict, paths: dict, report: SliceReport):
    cmd_class = norm["naming"]["commandClassName"]
    rel = f"slices/{cmd_class}/command.ts"
    content = read(paths["command"])
    if content is None:
        add(report, rel, "file_exists", MISSING)
        return
    add(report, rel, "file_exists", PASS)

    # Interface declaration
    if grep(content, rf"export interface {re.escape(cmd_class)}\s+extends\s+ICommand"):
        add(report, rel, "interface_declaration", PASS)
    else:
        add(report, rel, "interface_declaration", FAIL,
            f"Expected: export interface {cmd_class} extends ICommand")

    # commandType discriminant
    if grep(content, rf'commandType:\s*"{re.escape(cmd_class)}"'):
        add(report, rel, "commandType_discriminant", PASS)
    else:
        add(report, rel, "commandType_discriminant", FAIL,
            f'Expected: commandType: "{cmd_class}"')

    # Field presence + types (all fields including generated)
    for f in norm["command"]["fields"]:
        camel = f["camelName"]
        ts_type = f["tsType"]
        pattern = rf"readonly\s+{re.escape(camel)}\s*:\s*{re.escape(ts_type)}"
        if grep(content, pattern):
            add(report, rel, f"field_{camel}", PASS)
        else:
            # Check if field exists with wrong type
            if grep(content, rf"readonly\s+{re.escape(camel)}\s*:"):
                add(report, rel, f"field_{camel}", WARN,
                    f"Field exists but type may differ — expected: {ts_type}")
            else:
                add(report, rel, f"field_{camel}", FAIL,
                    f"Missing: readonly {camel}: {ts_type}")


def check_adapter(norm: dict, paths: dict, report: SliceReport):
    cmd_class = norm["naming"]["commandClassName"]
    rel = f"slices/{cmd_class}/adapter.ts"
    content = read(paths["adapter"])
    if content is None:
        add(report, rel, "file_exists", MISSING)
        return
    add(report, rel, "file_exists", PASS)

    # Adapter factory function
    if grep(content, rf"export function create{re.escape(cmd_class)}Adapter"):
        add(report, rel, "adapter_function", PASS)
    else:
        add(report, rel, "adapter_function", FAIL,
            f"Expected: export function create{cmd_class}Adapter")

    # Handler import
    if grep(content, rf"handle{re.escape(cmd_class)}"):
        add(report, rel, "handler_import", PASS)
    else:
        add(report, rel, "handler_import", FAIL,
            f"Expected import of handle{cmd_class}")


def check_events(norm: dict, paths: dict, report: SliceReport):
    for ev in norm["events"]:
        ev_class = ev["className"]
        rel = f"swimlanes/events/{ev_class}.ts"
        content = read(paths["events"][ev_class])
        if content is None:
            add(report, rel, "file_exists", MISSING)
            continue
        add(report, rel, "file_exists", PASS)

        # Interface declaration
        iface = f"I{ev_class}"
        if grep(content, rf"export interface {re.escape(iface)}"):
            add(report, rel, "interface_declaration", PASS)
        else:
            add(report, rel, "interface_declaration", FAIL,
                f"Expected: export interface {iface}")

        # Check input fields (generated fields may be omitted from event interface)
        for f in ev["inputFields"]:
            camel = f["camelName"]
            ts_type = f["tsType"]
            pattern = rf"readonly\s+{re.escape(camel)}\s*:\s*{re.escape(ts_type)}"
            if grep(content, pattern):
                add(report, rel, f"field_{camel}", PASS)
            else:
                if grep(content, rf"readonly\s+{re.escape(camel)}\s*:"):
                    add(report, rel, f"field_{camel}", WARN,
                        f"Field exists, type may differ — expected: {ts_type}")
                else:
                    add(report, rel, f"field_{camel}", FAIL,
                        f"Missing: readonly {camel}: {ts_type}")


def check_gwts(norm: dict, paths: dict, report: SliceReport):
    cmd_class = norm["naming"]["commandClassName"]
    specs = norm["specifications"]
    if not specs:
        return  # no gwts needed

    rel = f"slices/{cmd_class}/gwts.ts"
    content = read(paths["gwts"])
    if content is None:
        add(report, rel, "file_exists", MISSING)
        return
    add(report, rel, "file_exists", PASS)

    # Command import
    if grep(content, rf"import.*{re.escape(cmd_class)}.*from"):
        add(report, rel, "command_import", PASS)
    else:
        add(report, rel, "command_import", WARN,
            f"Expected import of {cmd_class} type")

    # One export per spec (predicate function)
    # We check that there are as many exported consts as specs
    exports = re.findall(r"^export const (\w+)", content, re.MULTILINE)
    spec_count = len(specs)
    if len(exports) >= spec_count:
        add(report, rel, "predicate_count", PASS,
            f"Found {len(exports)} predicates for {spec_count} specs")
    elif len(exports) > 0:
        add(report, rel, "predicate_count", WARN,
            f"Found {len(exports)} predicates but {spec_count} specs — may be incomplete")
    else:
        add(report, rel, "predicate_count", FAIL,
            f"No exported predicates found, expected {spec_count}")

    # Each predicate returns boolean
    for exp in exports:
        if grep(content, rf"export const {re.escape(exp)}.*:\s*boolean"):
            add(report, rel, f"predicate_{exp}_returns_bool", PASS)
        elif grep(content, rf"export const {re.escape(exp)}.*=>"):
            add(report, rel, f"predicate_{exp}_returns_bool", WARN,
                "Predicate exists but return type annotation not found")
        else:
            add(report, rel, f"predicate_{exp}_body", WARN,
                "Predicate defined but body unclear")

    # Check that no predicate is a stub (returns just false/true literal)
    for exp in exports:
        # Look for the function body — a stub returns literal false/true with a TODO
        stub_pattern = rf"export const {re.escape(exp)}[^;]+;\s*//\s*TODO"
        if grep(content, stub_pattern):
            add(report, rel, f"predicate_{exp}_implemented", WARN,
                f"Predicate {exp} appears to be a TODO stub")
        else:
            add(report, rel, f"predicate_{exp}_implemented", PASS)


def check_command_handler(norm: dict, paths: dict, report: SliceReport):
    cmd_class = norm["naming"]["commandClassName"]
    rel = f"slices/{cmd_class}/commandHandler.ts"
    content = read(paths["commandHandler"])
    if content is None:
        add(report, rel, "file_exists", MISSING)
        return
    add(report, rel, "file_exists", PASS)

    # Handler function export
    if grep(content, rf"export const handle{re.escape(cmd_class)}"):
        add(report, rel, "handler_export", PASS)
    else:
        add(report, rel, "handler_export", FAIL,
            f"Expected: export const handle{cmd_class}")

    # Each outbound event has an appendEvent call
    for ev_title in norm["command"]["outboundEvents"]:
        ev_class = _title_to_class(ev_title)
        pattern = rf"appendEvent{re.escape(ev_class)}\s*\("
        if grep(content, pattern):
            add(report, rel, f"appends_{ev_class}", PASS)
        else:
            add(report, rel, f"appends_{ev_class}", FAIL,
                f"Missing: stream.appendEvent{ev_class}({{...}})")

    # View destructure only when hasGivenEvents
    has_given = norm["view"]["hasGivenEvents"]
    slice_name = norm["naming"]["sliceName"]
    has_destructure = grep(content, rf"stream\.views\.SliceState{re.escape(slice_name)}")

    if has_given and not has_destructure:
        add(report, rel, "view_destructure", WARN,
            f"Slice has given events but no stream.views.SliceState{slice_name} reference")
    elif not has_given and has_destructure:
        add(report, rel, "view_destructure", WARN,
            f"Slice has no given events but references stream.views.SliceState{slice_name}")
    else:
        add(report, rel, "view_destructure", PASS)

    # No TODO comments remaining (warn only)
    todo_count = len(re.findall(r"//\s*TODO", content))
    if todo_count > 0:
        add(report, rel, "todos_remaining", WARN,
            f"{todo_count} TODO comment(s) remain — review business logic")
    else:
        add(report, rel, "todos_remaining", PASS)


def check_view_state(norm: dict, paths: dict, report: SliceReport):
    view = norm["view"]
    # view.viewName uses commandClassName (scaffold convention: SliceState<CommandClass>)
    expected_vn = view["viewName"]

    if not norm["specifications"]:
        return  # no view needed for no-spec slices

    rel = f"swimlanes/views/{expected_vn}/state.ts"
    content = read(paths["view_state"])
    if content is None:
        add(report, rel, "file_exists", MISSING)
        return
    add(report, rel, "file_exists", PASS)

    # viewName constant
    if grep(content, rf'viewName\s*=\s*"{re.escape(expected_vn)}"'):
        add(report, rel, "viewName_const", PASS)
    else:
        add(report, rel, "viewName_const", FAIL,
            f'Expected: viewName = "{expected_vn}"')

    # State type export
    if grep(content, rf"export type {re.escape(expected_vn)}ViewState"):
        add(report, rel, "state_type_export", PASS)
    else:
        add(report, rel, "state_type_export", FAIL,
            f"Expected: export type {expected_vn}ViewState")

    # State fields (only when hasGivenEvents)
    if view["hasGivenEvents"]:
        for f_name in view["stateFields"]:
            if grep(content, rf"readonly\s+{re.escape(f_name)}\s*:"):
                add(report, rel, f"state_field_{f_name}", PASS)
            else:
                add(report, rel, f"state_field_{f_name}", FAIL,
                    f"Missing state field: {f_name}")
    else:
        # No given events — should have minimal state (initialized flag or similar)
        if grep(content, r"readonly\s+\w+\s*:"):
            add(report, rel, "minimal_state", PASS)
        else:
            add(report, rel, "minimal_state", WARN,
                "No state fields found in view state type")


def check_test(norm: dict, paths: dict, report: SliceReport):
    cmd_class = norm["naming"]["commandClassName"]
    rel = f"slices/{cmd_class}/tests/command.slice.test.ts"
    content = read(paths["test"])
    if content is None:
        add(report, rel, "file_exists", MISSING)
        return
    add(report, rel, "file_exists", PASS)

    # describe block
    if grep(content, r"describe\("):
        add(report, rel, "describe_block", PASS)
    else:
        add(report, rel, "describe_block", FAIL, "No describe() block found")

    # Count test() calls — expect at least specs+1 (one per spec + main flow)
    test_count = len(re.findall(r"\btest\(", content))
    expected_min = len(norm["specifications"]) + 1
    if test_count >= expected_min:
        add(report, rel, "test_count", PASS,
            f"Found {test_count} tests (minimum {expected_min})")
    elif test_count > 0:
        add(report, rel, "test_count", WARN,
            f"Found {test_count} tests, expected at least {expected_min}")
    else:
        add(report, rel, "test_count", FAIL, "No test() calls found")

    # SliceTester.testCommandHandler call
    if grep(content, r"SliceTester\.testCommandHandler"):
        add(report, rel, "uses_slice_tester", PASS)
    else:
        add(report, rel, "uses_slice_tester", WARN,
            "SliceTester.testCommandHandler not found — test may not follow pattern")

    # Expected events reference each outbound event type
    for ev_title in norm["command"]["outboundEvents"]:
        ev_class = _title_to_class(ev_title)
        if grep(content, rf'"{re.escape(ev_class)}"'):
            add(report, rel, f"references_{ev_class}", PASS)
        else:
            add(report, rel, f"references_{ev_class}", WARN,
                f"Event type {ev_class} not referenced in test file")

    # No TODO comments
    todo_count = len(re.findall(r"//\s*TODO", content))
    if todo_count > 0:
        add(report, rel, "todos_remaining", WARN,
            f"{todo_count} TODO(s) remain — test data may be placeholder")
    else:
        add(report, rel, "todos_remaining", PASS)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _title_to_class(title: str) -> str:
    words = [w for w in re.split(r"[\s\-_]+", title.strip()) if w]
    if len(words) == 1:
        w = words[0]
        return w[0].upper() + w[1:] if w else w
    return "".join(w.capitalize() for w in words)


# ---------------------------------------------------------------------------
# Projection (STATE_VIEW) checks
# ---------------------------------------------------------------------------

def projection_src_paths(norm: dict, src_root: Path) -> dict:
    context = norm["slice"]["context"]
    slice_name = norm["naming"]["sliceName"]
    bc = src_root / "src" / "BusinessCapabilities" / context
    slices = bc / "slices" / slice_name
    return {
        "index": slices / "index.ts",
        "test": slices / "tests" / "projection.test.ts",
        "projections_registry": bc / "slices" / "projections.ts",
    }


def _load_raw_slice(normalized_path: Path, src_root: Path) -> dict | None:
    """Load the raw slice.json from the eventmodel directory."""
    # Derive slice.json path from normalized path:
    # .eventmodel/.normalized/<Context>/<folder>.normalized.json
    # → .eventmodel/.slices/<Context>/<folder>/slice.json
    norm_name = normalized_path.stem.replace(".normalized", "")
    context_dir = normalized_path.parent
    context_name = context_dir.name
    eventmodel_dir = context_dir.parent.parent  # .eventmodel/
    slice_json = eventmodel_dir / ".slices" / context_name / norm_name / "slice.json"
    if slice_json.exists():
        return json.loads(slice_json.read_text())
    return None


def check_projection(norm: dict, raw_slice: dict, paths: dict, report: SliceReport):
    slice_name = norm["naming"]["sliceName"]
    camel_name = slice_name[0].lower() + slice_name[1:]

    # Collect inbound events from readmodel dependencies
    readmodel = raw_slice["readmodels"][0]
    inbound_events = [
        _title_to_class(dep["title"])
        for dep in readmodel.get("dependencies", [])
        if dep.get("type") == "INBOUND" and dep.get("elementType") == "EVENT"
    ]

    # ── index.ts ──
    rel = f"slices/{slice_name}/index.ts"
    content = read(paths["index"])
    if content is None:
        add(report, rel, "file_exists", MISSING)
    else:
        add(report, rel, "file_exists", PASS)

        # ProjectionConfig export
        if grep(content, rf"export const {re.escape(camel_name)}Slice"):
            add(report, rel, "projection_export", PASS)
        else:
            add(report, rel, "projection_export", FAIL,
                f"Expected: export const {camel_name}Slice")

        # projectionName
        if grep(content, rf'projectionName:\s*"{re.escape(slice_name)}"'):
            add(report, rel, "projection_name", PASS)
        else:
            add(report, rel, "projection_name", FAIL,
                f'Expected: projectionName: "{slice_name}"')

        # Handler per inbound event
        for evt in inbound_events:
            if grep(content, rf"{re.escape(evt)}\s*:"):
                add(report, rel, f"handler_{evt}", PASS)
            else:
                add(report, rel, f"handler_{evt}", FAIL,
                    f"Missing handler for inbound event {evt}")

        # SQL present in handlers
        if grep(content, r"sql\s*:"):
            add(report, rel, "sql_present", PASS)
        else:
            add(report, rel, "sql_present", FAIL,
                "No SQL statements found in handlers")

        # Check for generic JSON.stringify TODO
        if grep(content, r"JSON\.stringify\(p\).*TODO"):
            add(report, rel, "todo_json_stringify", WARN,
                "Generic JSON.stringify(p) with TODO — SQL not customized yet")
        else:
            add(report, rel, "todo_json_stringify", PASS)

    # ── test file ──
    test_rel = f"slices/{slice_name}/tests/projection.test.ts"
    test_content = read(paths["test"])
    if test_content is None:
        add(report, test_rel, "file_exists", MISSING)
    else:
        add(report, test_rel, "file_exists", PASS)

        if grep(test_content, r"describe\(") or grep(test_content, r"ProjectionSliceTester"):
            add(report, test_rel, "test_structure", PASS)
        else:
            add(report, test_rel, "test_structure", FAIL, "No describe() or ProjectionSliceTester found")

        for evt in inbound_events:
            if grep(test_content, rf"{re.escape(evt)}"):
                add(report, test_rel, f"references_{evt}", PASS)
            else:
                add(report, test_rel, f"references_{evt}", WARN,
                    f"Event {evt} not referenced in projection test")

    # ── projections.ts registry ──
    reg_rel = f"slices/projections.ts"
    reg_content = read(paths["projections_registry"])
    if reg_content is None:
        add(report, reg_rel, "registry_exists", WARN,
            "No projections.ts registry file — projection may not be discovered at startup")
    else:
        if grep(reg_content, rf"{re.escape(camel_name)}Slice"):
            add(report, reg_rel, "registered", PASS)
        else:
            add(report, reg_rel, "registered", WARN,
                f"{camel_name}Slice not found in projections.ts registry")


# ---------------------------------------------------------------------------
# Full slice verification
# ---------------------------------------------------------------------------

def verify(normalized_path: Path, src_root: Path) -> SliceReport:
    norm = json.loads(normalized_path.read_text())
    slice_name = norm["naming"]["sliceName"]
    report = SliceReport(slice_name=slice_name, normalized_path=str(normalized_path))

    # STATE_VIEW (projection) slices have their own checks
    if norm["slice"]["sliceType"] == "STATE_VIEW":
        raw_slice = _load_raw_slice(normalized_path, src_root)
        if raw_slice and raw_slice.get("readmodels"):
            # Skip todoList readmodels — these are pg-boss work queues,
            # not Kafka projections. The scaffold intentionally does not
            # generate index.ts or projection.test.ts for them.
            if any(rm.get("todoList") for rm in raw_slice.get("readmodels", [])):
                add(report, "(skip)", "slice_type",
                    WARN, "STATE_VIEW with todoList — handled by pg-boss, not projection")
                return report
            paths = projection_src_paths(norm, src_root)
            check_projection(norm, raw_slice, paths, report)
            return report
        add(report, "(skip)", "slice_type",
            WARN, "STATE_VIEW with no readmodels — nothing to verify")
        return report

    # Other non-STATE_CHANGE types (processors, etc.) are not yet supported
    if norm["slice"]["sliceType"] != "STATE_CHANGE":
        add(report, "(skip)", "slice_type",
            WARN, f"Skipped: sliceType={norm['slice']['sliceType']} — verifier handles STATE_CHANGE and STATE_VIEW")
        return report

    cmd_class = norm["naming"]["commandClassName"]
    if not cmd_class:
        add(report, "(skip)", "no_command",
            WARN, "Skipped: slice has no commands")
        return report

    paths = src_paths(norm, src_root)

    check_command(norm, paths, report)
    check_adapter(norm, paths, report)
    check_events(norm, paths, report)
    check_gwts(norm, paths, report)
    check_command_handler(norm, paths, report)
    check_view_state(norm, paths, report)
    check_test(norm, paths, report)

    return report


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

STATUS_ICON = {PASS: "✓", WARN: "⚠", FAIL: "✗", MISSING: "○"}
STATUS_ORDER = {PASS: 0, WARN: 1, FAIL: 2, MISSING: 3}


def print_report(report: SliceReport, verbose: bool = False):
    icon = "PASS" if report.passed else "FAIL"
    fails = report.fail_count
    warns = report.warn_count
    total = len(report.checks)

    print(f"\n{'='*60}")
    print(f"  {icon}  {report.slice_name}")
    print(f"  {total} checks — {fails} fail, {warns} warn")
    print(f"{'='*60}")

    # Group by file
    by_file: dict[str, list[Check]] = {}
    for c in report.checks:
        by_file.setdefault(c.file, []).append(c)

    for file, checks in by_file.items():
        file_status = max(checks, key=lambda x: STATUS_ORDER[x.status]).status
        print(f"\n  {STATUS_ICON[file_status]} {file}")
        for c in checks:
            if c.status == PASS and not verbose:
                continue
            icon_c = STATUS_ICON[c.status]
            detail = f" — {c.detail}" if c.detail else ""
            print(f"      {icon_c} {c.check}{detail}")

    print()


def print_report_json(report: SliceReport):
    print(json.dumps({
        "slice": report.slice_name,
        "passed": report.passed,
        "fail_count": report.fail_count,
        "warn_count": report.warn_count,
        "checks": [
            {"file": c.file, "check": c.check, "status": c.status, "detail": c.detail}
            for c in report.checks
        ],
    }, indent=2))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Verify evdb slice TypeScript against normalized spec")
    parser.add_argument("normalized", nargs="?", help="Path to .normalized.json")
    parser.add_argument("--src", default=".", help="Source root (default: .)")
    parser.add_argument("--all", action="store_true", help="Verify all normalized files under --root")
    parser.add_argument("--root", default=".", help="Repo root for --all (default: .)")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show all checks including PASS")
    args = parser.parse_args()

    if args.all:
        root = Path(args.root).resolve()
        normalized_dir = root / ".eventmodel" / ".normalized"
        if not normalized_dir.exists():
            print(f"ERROR: {normalized_dir} not found. Run evdb-normalize first.", file=sys.stderr)
            sys.exit(1)

        files = sorted(normalized_dir.rglob("*.normalized.json"))
        if not files:
            print("No .normalized.json files found.", file=sys.stderr)
            sys.exit(1)

        reports = [verify(f, root) for f in files]
        any_failed = any(not r.passed for r in reports)

        if args.json:
            print(json.dumps([{
                "slice": r.slice_name,
                "passed": r.passed,
                "fail_count": r.fail_count,
                "warn_count": r.warn_count,
                "checks": [
                    {"file": c.file, "check": c.check, "status": c.status, "detail": c.detail}
                    for c in r.checks
                ],
            } for r in reports], indent=2))
        else:
            # Summary table
            print(f"\n{'Slice':<35} {'Status':<8} {'Fail':<6} {'Warn'}")
            print("-" * 60)
            for r in reports:
                status = "PASS" if r.passed else "FAIL"
                print(f"  {r.slice_name:<33} {status:<8} {r.fail_count:<6} {r.warn_count}")

            passed = sum(1 for r in reports if r.passed)
            print(f"\n  {passed}/{len(reports)} slices passed")

            if any_failed:
                print("\nFailed slices — run with a specific .normalized.json for details")
                for r in reports:
                    if not r.passed:
                        print_report(r, verbose=args.verbose)

        sys.exit(1 if any_failed else 0)

    if not args.normalized:
        parser.print_help()
        sys.exit(1)

    normalized_path = Path(args.normalized).resolve()
    src_root = Path(args.src).resolve() if args.src != "." else Path(args.root).resolve()

    report = verify(normalized_path, src_root)

    if args.json:
        print_report_json(report)
    else:
        print_report(report, verbose=args.verbose)

    sys.exit(0 if report.passed else 1)


if __name__ == "__main__":
    main()
