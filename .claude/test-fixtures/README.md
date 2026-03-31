# Test Fixtures

Each fixture is a different state of the event model (as if exported from Miro), containing `config.json`, `index.json`, and where relevant, individual `slice.json` files.

---

## CRUD Fixtures

### baseline/
Current model as-is. 11 slices, no changes. The control.

### new-slice/
**Miro action:** User creates a new slice.
**Change:** Added "Withdrawal Fee Calculation" (STATE_CHANGE, index 21).
**Edge cases covered:**
- `generated: true` fields (feeRate, feeAmount) — must be in endpoint, not command
- Dual events (WithdrawalFeeCalculated + WithdrawalFeeWaived)
- Spec with `given` events — needs SliceState view + gwts.ts
- Spec predicate name from comments ("isVipCustomer")

### deleted-slice/
**Miro action:** User deletes a slice.
**Change:** Removed "Pending Withdrawal Lookup" from config + index.
**Edge cases covered:**
- Code exists in `src/` but slice is gone from model — orphaned code
- evdb-diff must detect and report delete action

### amended-slice/
**Miro action:** User modifies an existing slice.
**Change:** "Fund Deposit" gets new `depositChannel` field + new spec.
**Edge cases covered:**
- New field on existing command, event, and readmodel
- New spec with empty `then[]` — idempotent no-op handler branch
- New predicate "isDuplicateTransaction" added to gwts.ts
- Hash drift detection by evdb-diff

### multi-change/
**Miro action:** Batch export after multiple changes.
**Change:** ADD new slice + DELETE "Account Balance Read Model" + AMEND "Withdrawal Approval" (new field).
**Edge cases covered:**
- Three change types in one audit pass
- Order of operations matters
- Deleted slice has existing projection code

---

## GWT / Specification Fixtures

### gwt-empty-then/
**Edge case:** Spec where `then[]` is empty — idempotent ignore path.
**Slice:** "Deposit Validation" — if already validated, do nothing.
**What must happen:**
- commandHandler has a branch that appends NO events
- gwts.ts has predicate "isAlreadyValidated"
- Test covers the no-op path (given validated deposit, when validate again, then nothing)

### gwt-multiple-specs/
**Edge case:** Slice with 3 event outcomes from 2 specs + default happy path.
**Slice:** "Transfer Funds" — can succeed, fail (insufficient funds), or fail (same account).
**What must happen:**
- gwts.ts has TWO predicates: "hasInsufficientFundsForTransfer" + "isSameAccount"
- commandHandler has THREE branches (success + 2 declines)
- Tests cover all 3 paths
- One spec has `given` (needs SliceState), other has empty `given` (no prior state)
- `generated: true` fields (transferDate, reason) handled correctly per event

### gwt-no-predicate-name/
**Edge case:** Spec with empty `comments[]` — no predicate name hint.
**Slice:** "Verify Account" — spec says account doesn't exist, but no comment naming the predicate.
**What must happen:**
- Skill must infer a predicate name from spec title or derive one
- gwts.ts still created with a usable function name
- `generated: true` field (reason) on the failure event

---

## Field Type Fixtures

### custom-type-field/
**Edge case:** `type: "Custom"` with JSON schema + `cardinality: "List"`.
**Slice:** "Record Payment Method" — has `paymentDetails` (Custom with nested schema) and `tags` (List of strings).
**What must happen:**
- Custom type parsed from schema string to TypeScript interface
- List cardinality mapped to array type (`string[]`)
- Both appear in event interface and command

---

## Status Fixtures

### status-mismatch/
**Edge case:** Statuses don't match reality.
**Changes:**
- "Fund Deposit": status=Done (code exists — should stay Done)
- "Withdrawal Approval": status=Done (code exists — should stay Done)
- "Calculate Commission": status=Blocked (should be skipped)
- "Withdraw Funds Processor": status=Ready (INVALID status)
**What must happen:**
- evdb-diff must not downgrade "Done" to anything
- evdb-dev must skip "Blocked" slices
- Invalid "Ready" status handled gracefully (not crash)

---

## Boundary Fixtures

### empty-model/
**Edge case:** config.json with zero slices.
**What must happen:**
- Skills report nothing to do, no errors
- Existing code not affected
