---
name: evdb-normalize
description: >
  Extracts all deterministic structured data from slice.json files into
  .normalized.json intermediate files (Option C normalization). Handles naming
  conversions, type mapping, field classification, spec GWT scenarios, and view
  state field derivation. Predicate boolean expressions are left as null with
  review_required: true — no guessing. Use before evdb-scaffold to provide it
  a richer, pre-parsed input.
---

# evdb-normalize

Produces `.eventmodel/.normalized/<Context>/<sliceDir>.normalized.json` from
each `slice.json` in `.eventmodel/.slices/`.

## What it extracts (deterministically)

| Field | Source | Example output |
|---|---|---|
| `naming.sliceName` | slice title | `WithdrawalApproval` |
| `naming.sliceDir` | slice title | `withdrawalapproval` |
| `naming.commandClassName` | command title | `ApproveWithdrawal` |
| `naming.commandHandlerName` | command title | `approveWithdrawal` |
| `command.fields[].tsType` | field type | `UUID→string`, `Double→number`, `DateTime→Date` |
| `command.inputFields` | `generated: false` fields | fields the caller must supply |
| `command.generatedFields` | `generated: true` fields | system-set fields |
| `command.outboundEvents` | command dependencies | `["Funds Withdrawal Approved", ...]` |
| `events[].className` | event title | `FundsWithdrawalDeclined` |
| `specifications[].when/then/given` | spec fields + examples | structured GWT test data |
| `view.hasGivenEvents` | any spec has `given` | `true` / `false` |
| `view.stateFields` | fields from given events | `["accountId", "currency", ...]` |

## What stays null (review_required: true)

| Field | Why |
|---|---|
| `specifications[].predicate.expression` | Boolean expression requires human/AI to author |
| Computed field formulas | e.g. `openedAt = now()` — not derivable from field metadata |

The `hint` field carries the spec comment text as a cue for whoever fills in the expression.

## Usage

```bash
# Single slice
python3 .claude/skills/evdb-normalize/scripts/normalize_slice.py \
  .eventmodel/.slices/Funds/withdrawalapproval/slice.json

# All slices
python3 .claude/skills/evdb-normalize/scripts/normalize_slice.py --all --root .

# Dry-run (print to stdout, don't write)
python3 .claude/skills/evdb-normalize/scripts/normalize_slice.py \
  .eventmodel/.slices/Funds/withdrawalapproval/slice.json --dry-run
```

## Output location

```
.eventmodel/
  .normalized/
    Funds/
      withdrawalapproval.normalized.json
      withdrawfunds.normalized.json
      ...
```

## Type mapping

| evdb type | TypeScript type |
|---|---|
| UUID | string |
| String | string |
| Double | number |
| Integer | number |
| Long | number |
| Boolean | boolean |
| DateTime | Date |
| Date | Date |

## Integration with scaffold

After running normalize, evdb-scaffold reads `.normalized.json` and:
- Uses `view.hasGivenEvents` to decide whether to emit the view destructure
- Uses `view.stateFields` for the destructured field names
- Uses `command.inputFields` / `generatedFields` to build type signatures
- Uses `specifications[].when/then/given` to populate GWT test stubs
