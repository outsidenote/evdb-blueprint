---
name: evdb-verify
description: >
  Contract verifier for evdb slices. Compares generated TypeScript files against
  .normalized.json spec to detect drift, missing implementations, and structural
  violations. Use after evdb-scaffold or evdb-dev-v2 to confirm the generated code
  matches the event model contract. Trigger for phrases like "verify the slice",
  "check generated code against spec", "run contract checks", or "what's drifted".
---

# evdb-verify

Reads `.eventmodel/.normalized/<Context>/<sliceDir>.normalized.json` and checks
the corresponding TypeScript files against the spec. Uses grep-based checks — no
TypeScript compilation required. Runs in under 1 second per slice.

## Status codes

| Code | Meaning |
|---|---|
| PASS | Matches spec |
| WARN | Minor issue (comment TODO, missing annotation, cosmetic) |
| FAIL | Structural violation — field missing, wrong name, wrong event |
| MISSING | File not generated |

Only STATE_CHANGE slices with commands are verified. Read models, projections, and
processors are skipped with WARN.

## What is checked

| File | Checks |
|---|---|
| `command.ts` | Interface name, `commandType` discriminant, all field names + TS types |
| `adapter.ts` | `create<X>Adapter` function, handler import |
| `swimlanes/events/<E>.ts` | Interface name, input field names + TS types |
| `gwts.ts` | File exists (if specs), one predicate per spec, no TODO stubs |
| `commandHandler.ts` | Handler export, `appendEvent<X>` for each outbound event, view destructure only when `hasGivenEvents` |
| `views/SliceState<X>/state.ts` | `viewName` const, state type export, state fields (when given events) |
| `tests/command.slice.test.ts` | `describe` block, ≥ specs+1 test cases, `SliceTester.testCommandHandler`, all event types referenced |

## Usage

```bash
# Single slice (verbose — show all checks including PASS)
python3 .claude/skills/evdb-verify/scripts/verify_slice.py \
  .eventmodel/.normalized/Funds/withdrawalapproval.normalized.json --verbose

# All slices — summary table + detail on failures
python3 .claude/skills/evdb-verify/scripts/verify_slice.py --all --root .

# JSON output (for CI/scripting)
python3 .claude/skills/evdb-verify/scripts/verify_slice.py --all --root . --json
```

## Exit code

- `0` — all STATE_CHANGE slices pass (WARN is acceptable)
- `1` — one or more FAIL or MISSING

## Run order

Always run after normalization:

```bash
# Full pipeline check
python3 .claude/skills/evdb-normalize/scripts/normalize_slice.py --all --root .
python3 .claude/skills/evdb-verify/scripts/verify_slice.py --all --root .
```

## Interpreting findings

**MISSING across all files** — slice is Planned (not yet implemented). Expected.

**Field FAIL** — event model added/removed a field but the TypeScript wasn't regenerated.
Regenerate via evdb-scaffold or update manually.

**predicate_count FAIL** — new spec was added to the event model without a matching predicate
in gwts.ts.

**appends_X FAIL** — command handler doesn't call `stream.appendEvent<EventName>` — either the
handler is wrong or the event model changed.

**state_type_export FAIL** — type name typo or drift between viewName const and type export.
