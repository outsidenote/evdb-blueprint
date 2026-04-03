# Learned Hints — evdb-dev-v2

**Read this BEFORE filling in TODOs.**
This file teaches derivation patterns — how to reason from the spec to the code.
Apply these rules to any slice. Domain-specific discoveries accumulate in the final section.

---

## How to derive predicates (gwts.ts)

A predicate answers: **"is this spec branch the one that fires?"**

**Derivation rule:**
1. Read `spec.comments[0].description` — this is the condition in plain English
2. Translate the plain-English condition into a boolean expression
3. Compare `command.*` fields against `state.*` fields or literal boundaries
4. If the spec describes a violation/rejection, the predicate returns `true` when the violation IS present

**Pattern:**
```
spec description: "amount is zero or negative"
→ predicate: command.amount <= 0

spec description: "insufficient funds"
→ predicate: state.balance < command.amount

spec description: "account already exists"
→ predicate: state.initialized === true
```

**What fields to compare:**
- `command.*` — the input values being validated
- `state.*` — the accumulated history (from `stream.views.SliceState<SliceName>`)
- State fields come from the `given` events in the spec — they show what was accumulated before the command

---

## How to derive computed field values (commandHandler.ts)

Computed fields are marked `"generated": true` in the event model.
They are NOT on the command — the handler must compute them.

**Derivation rule:**
1. Look at the spec's `then` block — the example value shows the expected output
2. If the example value is a formula (e.g., `amount * rate`), derive it from command fields
3. If the example value is a string (e.g., a reason), rephrase the violated condition as a user-facing message
4. If the example value is a date/timestamp, forward it from `command.*` (set at the endpoint, not here)

**Pattern:**
```
generated field: reason (String), example: "Amount must be greater than zero"
→ derive: rephrase the condition that caused this branch — "X must be Y"

generated field: commission (Double), example: 2.00, amount was 200
→ derive: look for a rate — commission = amount * rate (find rate from spec examples)

generated field: approvalDate (DateTime)
→ derive: forward from command.approvalDate — it was set to new Date() at the endpoint
```

**Rule: never call `new Date()` or `randomUUID()` inside `commandHandler.ts`.**
Generated timestamps and IDs always come from the command object (injected at the endpoint).

---

## How to derive view accumulation (SliceState views)

A view handler answers: **"how does this event change the state?"**

**Derivation rule:**
1. Look at what the event represents semantically (deposit, withdrawal, approval, rejection)
2. Identify which state fields the event affects
3. Choose the operation based on the event's semantic direction:
   - Event adds something → `state.field + event.field`
   - Event removes something → `state.field - event.field`
   - Event replaces something → `event.field` (overwrite)
   - Event initializes → set `initialized: true`, copy relevant fields

**Pattern:**
```typescript
// Accumulate (increases a quantity):
FundDeposited: (state, event) => ({ ...state, balance: state.balance + event.amount })

// Reduce (decreases a quantity):
FundsWithdrawn: (state, event) => ({ ...state, balance: state.balance - event.amount })

// First-time initialization:
AccountCreated: (state, event) => ({ ...state, initialized: true, accountId: event.accountId })
```

**Initialized flag:** All SliceState views have `initialized: boolean = false`.
Set it to `true` on the first event that proves the aggregate exists.

---

## How to construct test data (command.slice.test.ts)

**Derivation rule:**
1. Read each spec in `TODO_CONTEXT.md` — `given / when / then` are the test case
2. `given` events → `givenEvents` array (use the field examples from the spec)
3. `when` command → `command` object (use the field examples from the spec)
4. `then` events → `expectedEvents` array — **must include ALL fields from the event interface**
5. For computed/generated fields in `expectedEvents`: use the value from the spec example

**Date handling:**
- Use `new Date("ISO-8601-string")` for Date fields
- The command's `recordedAt` / `approvalDate` and the event's copy must be the **same object or same value**

**Reason strings in expectedEvents:**
- Must exactly match the string written in `commandHandler.ts`
- If the scaffold pre-filled it from the spec example, verify it matches before trusting it

---

## Domain-specific discoveries

Patterns found in this specific codebase that are NOT derivable from first principles.
Each entry records what was discovered, which slice, and the date.

<!-- scan_learn.py append writes below this line -->

_No domain-specific discoveries yet. First successful run will add entries here._

