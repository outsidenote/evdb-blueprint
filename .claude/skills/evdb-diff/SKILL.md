---
name: evdb-diff
description: >
  Audits the entire `.eventmodel/.slices/index.json` against the actual
  `src/BusinessCapabilities/` codebase to synchronize slice statuses. Updates
  each slice to "Planned" if no implementation is found, or "Review" if code
  exists (never downgrades a "Done" slice). Use this skill whenever the user
  wants to know what changed in the event model, what needs to be implemented
  or deleted, what slices are new or missing, asks for a diff/delta/action list
  from the event model index, or asks to sync/update slice statuses. Trigger
  even if the user just says "what changed?", "what do I need to implement?",
  "sync the index", or "update slice statuses" in the context of this evdb
  project.
---

You are a status auditor for an event-sourced system built with the
**eventualize-js (evdb) framework**. Your job is to read the entire
`.eventmodel/.slices/index.json`, check whether each slice has a
corresponding implementation in `src/BusinessCapabilities/`, and update the
`status` field of every slice accordingly — then write the updated file back.

There are five passes: a **direct scan** (does a code directory exist?), a
**todo-list scan** (is the slice implicitly satisfied by a message producer
elsewhere?), an **automation-processor scan** (is the slice implicitly wired
by a pg-boss endpoint for the command it delegates to?), a **hash integrity
check** (has the spec changed since the slice was last implemented?), and a
**blocked slice review** (did originally-Blocked slices get resolved, do they
still have the same problem, or has a different problem emerged?).
All passes respect the "Done" invariant — never touch those.

---

## Pre-pass — Record Blocked slices

Each invocation of this skill is a fresh audit. Even if this is the second or
third time the skill has run in the same conversation, always re-read every
file and re-execute every grep/ls command from scratch. Prior results in
context may reflect a different point in time and must not be reused — files
change between runs, and stale data leads to wrong verdicts (especially for
Blocked slices that may have just been fixed).

Before running any pass, collect the IDs and folders of every slice whose
current `status` in `index.json` is `"Blocked"`. Store this as
`originallyBlocked`.

You will use this list after all four main passes complete to produce the
Blocked review report (Pass 5). The key information to note for each:

- **Has a stored hash in `implementation-hashes.json`?**
  - Yes → original problem was *spec drift*: the spec changed after the slice
    was implemented and the hash no longer matched.
  - No → original problem was *missing identifiers*: key code identifiers
    expected by the spec were absent from the codebase (or the block was set
    manually).

---

## Pass 1 — Direct implementation scan

### 1. Read the full index

Read `.eventmodel/.slices/index.json` and collect every slice entry. Each
entry has at minimum:

```json
{
  "id": "...",
  "slice": "slice: Some Name",
  "context": "Funds",
  "folder": "someslicefolder",
  "status": "Planned"
}
```

### 2. For each slice, determine the correct status

**Skip slices whose current `status` is `"Done"`** — those have already been
reviewed and acknowledged; do not touch them.

For every other slice:

1. **Check the context directory exists:**
   Does `src/BusinessCapabilities/<context>/` exist as a directory?
   If the entire context is absent → `"Planned"`.

2. **Check for a matching implementation directory:**
   Look inside `src/BusinessCapabilities/<context>/slices/` for a subdirectory
   whose name, when lowercased, equals the slice's `folder` value.

   Use a case-insensitive comparison because `folder` is lowercase
   (e.g. `"withdrawfunds"`) while code dirs use PascalCase (`WithdrawFunds`).

   - Match found → `"Review"`
   - No match → `"Planned"`

### 3. Collect implementation directory names efficiently

List directories once per unique context:

```bash
ls src/BusinessCapabilities/Funds/slices/
```

Then compare each `folder` value: `folder.toLowerCase() === dirName.toLowerCase()`.

---

## Pass 2 — Todo-list slice implicit scan

After Pass 1, take all slices that are still `"Planned"` and check whether
each is a **todo-list slice** that is already implicitly implemented via a
message producer in another slice.

### What is a todo-list slice?

A todo-list slice is a purely reactive read model — it has no command
implementation of its own. Instead, it acts as a queue/inbox: an upstream
event populates it, and a downstream automation drains it. Because its
behaviour lives entirely inside the swimlane's message producer (which emits a
pg-boss queue message when the triggering event fires), there is no dedicated
slice directory to create.

Concretely, in `.eventmodel/.slices/<context>/<folder>/slice.json` a
todo-list slice looks like this:

```json
{
  "sliceType": "STATE_VIEW",
  "readmodels": [
    {
      "dependencies": [
        { "type": "INBOUND",  "elementType": "EVENT",      "title": "Funds Withdrawal Approved" },
        { "type": "OUTBOUND", "elementType": "AUTOMATION",  "title": "Withdraw Commission Calculator" }
      ]
    }
  ]
}
```

The signature is: **exactly one readmodel** whose dependencies contain at
least one INBOUND EVENT and at least one OUTBOUND AUTOMATION.

### Detection algorithm

For each still-Planned slice:

1. **Read the slice definition:**
   `.eventmodel/.slices/<context>/<folder>/slice.json`

2. **Check the todo-list shape:**
   - `readmodels` array has exactly 1 item
   - That item's `dependencies` contains an entry with `type: "INBOUND"` and
     `elementType: "EVENT"` (the triggering event)
   - That item's `dependencies` contains an entry with `type: "OUTBOUND"` and
     `elementType: "AUTOMATION"` (the downstream processor)

   If any of these conditions fail, the slice is not a todo-list → leave
   status as `"Planned"` and move on.

3. **Extract the triggering event type:**
   Take the INBOUND EVENT's `title` (e.g. `"Funds Withdrawal Approved"`) and
   convert it to a PascalCase identifier by capitalising each word and removing
   spaces → `"FundsWithdrawalApproved"`. This is the event type name used in
   the TypeScript source.

4. **Search for a queue-message producer:**
   Grep `src/BusinessCapabilities/<context>/` for TypeScript files (`.ts`)
   that contain **both**:
   - `createPgBossQueueMessageFromMetadata` — the helper that enqueues work
   - The PascalCase event type name derived in step 3

   If any file matches, the todo-list slice is implicitly satisfied: the
   message producer for that event is already emitting the queue message that
   drives the automation, so no additional slice directory is needed.

   - Match found → set status to `"Review"`
   - No match → leave as `"Planned"`

### Example

Slice `withdrawalpendingcommissioncalculationtodo` has:
- Inbound event: `"Funds Withdrawal Approved"` → type `"FundsWithdrawalApproved"`
- Check: does any `.ts` file under `src/BusinessCapabilities/Funds/` contain
  both `createPgBossQueueMessageFromMetadata` and `FundsWithdrawalApproved`?
- `approvedMessages.ts` does → **status: Review**

---

## Pass 3 — Automation-processor implicit scan

After Pass 2, take all slices that are still `"Planned"` and check whether
each is a **pure automation-processor slice** that is already implicitly wired
by a pg-boss endpoint registered for the command it delegates to.

### What is an automation-processor slice?

An automation-processor slice contains no command handlers of its own. Instead
it holds one or more `processors` (automations) that read from a queue and
dispatch a command. Because the wiring lives entirely inside the endpoint's
`pg-boss/index.ts` file (which defines the worker, queue name, and
payload-to-command mapping), no dedicated slice directory is needed — the
endpoint *is* the implementation of the automation.

Concretely, in `.eventmodel/.slices/<context>/<folder>/slice.json` such a
slice looks like:

```json
{
  "sliceType": "STATE_VIEW",
  "commands": [],
  "processors": [
    {
      "type": "AUTOMATION",
      "dependencies": [
        { "type": "INBOUND",  "elementType": "READMODEL", "title": "..." },
        { "type": "OUTBOUND", "elementType": "COMMAND",   "title": "Calculate Withdraw Commission" }
      ]
    }
  ]
}
```

The signature is: **`commands` array is empty** AND **at least one processor
has an OUTBOUND dependency with `elementType: "COMMAND"`**.

### Detection algorithm

For each still-Planned slice:

1. **Read the slice definition:**
   `.eventmodel/.slices/<context>/<folder>/slice.json`

2. **Check the automation-processor shape:**
   - `commands` array is empty (or absent)
   - `processors` array is non-empty
   - At least one processor has a dependency entry with `type: "OUTBOUND"` and
     `elementType: "COMMAND"`

   If any condition fails → not an automation-processor slice, leave as
   `"Planned"` and move on.

3. **Extract the target command name:**
   Take each OUTBOUND COMMAND dependency's `title` (e.g.
   `"Calculate Withdraw Commission"`) and convert it to PascalCase by
   capitalising each word and removing spaces →
   `"CalculateWithdrawCommission"`. This is the expected endpoint directory
   name.

4. **Check for a pg-boss endpoint:**
   List `src/BusinessCapabilities/<context>/endpoints/` subdirectories. For
   each OUTBOUND COMMAND, find any subdirectory that contains a
   `pg-boss/index.ts` file and whose lowercased name is similar to the
   lowercased PascalCase command name.

   Use **fuzzy case-insensitive matching** — endpoint directory names can have
   spelling drift relative to the event model (e.g. `"CalculateWithdrawComission"`
   vs `"CalculateWithdrawCommission"`). Accept a match if one lowercased string
   starts with the other, or if they differ by at most one character. The goal
   is to catch real wiring, not to enforce naming conventions.

   - Match found (endpoint dir with `pg-boss/index.ts` exists) → set status
     to `"Review"` — the automation is already wired
   - No match → leave as `"Planned"`

### Example

Slice `withdrawalcommissionprocessor` has:
- Processor with OUTBOUND COMMAND: `"Calculate Withdraw Commission"` →
  `"CalculateWithdrawCommission"`
- Endpoint dir `CalculateWithdrawComission` (one `s`) fuzzy-matches
  `CalculateWithdrawCommission` (two `s`s), and
  `CalculateWithdrawComission/pg-boss/index.ts` exists → **status: Review**

Slice `withdrawfundsprocessor` has:
- Processor with OUTBOUND COMMAND: `"Withdraw Funds"` → `"WithdrawFunds"`
- `src/BusinessCapabilities/Funds/endpoints/WithdrawFunds/pg-boss/index.ts`
  exists → **status: Review**

---

## Pass 4 — Hash integrity check

After Passes 1–3, run a hash check against `.eventmodel/implementation-hashes.json` to detect spec drift and catch unverified implementations.

### What is the implementation hash?

Every time a slice is implemented, evdb-dev records an MD5 fingerprint of its specification (its entry in `config.json`, with the volatile `status` and `index` fields stripped) in `.eventmodel/implementation-hashes.json`:

```json
{
  "3458764660904120114": "a7f3c9...",
  "3458764660904347015": "d2e18b..."
}
```

If the spec later changes but the code is not updated, the stored hash will no longer match the current config — which is exactly what Pass 4 detects.

### Hash computation

For each slice, compute its current config hash with:

```bash
python3 -c "
import json, hashlib

slice_id = '<slice_id>'
EXCLUDED = {'status', 'index'}

with open('.eventmodel/config.json') as f:
    config = json.load(f)

spec = next(s for s in config['slices'] if s['id'] == slice_id)
spec = {k: v for k, v in spec.items() if k not in EXCLUDED}
print(hashlib.md5(json.dumps(spec, sort_keys=True, separators=(',',':')).encode()).hexdigest())
"
```

Run this once per slice; batch multiple slices in one Python invocation if possible to avoid repeated I/O.

### Pass 4 algorithm

1. **Read `.eventmodel/implementation-hashes.json`** (treat as `{}` if the file doesn't exist).
2. **For each non-Done slice**, check two conditions independently:

   **a. Spec drift (slice HAS a stored hash):**
   - Compute the current config hash for the slice.
   - If current hash ≠ stored hash → the spec changed since implementation.
     Set status to `"Blocked"`. The hash file is **not** updated — the stale hash stays until a human reimplements the slice and re-records it with evdb-dev.
   - If hashes match → no change.

   **b. Unverified implementation (slice has Review status but NO stored hash):**
   This happens when a slice was implemented before the hashing system was in place.
   Verify the code reflects the current spec by scanning for key identifiers:

   - **STATE_CHANGE slice** (has `commands[]`): for each command, convert its `title` to PascalCase (remove spaces) and grep `src/BusinessCapabilities/<context>/slices/` for that identifier. Also check that the event type names from internal `events[].title` entries appear in the stream factory (`swimlanes/`). External events (those with `elementContext: "EXTERNAL"`) are published outside the internal stream and do not need to appear in the stream factory.

   - **STATE_VIEW projection slice** (has a code directory from Pass 1): projection slices consume **messages**, not events directly. The event type name and the message type name are independent — the stream factory `withMessages("<EventType>", fn)` key tells the stream *which event* triggers the messages, but the actual message type string is set by the messages function itself via `EvDbMessage.createFromMetadata(metadata, "<messageType>", ...)`. These can differ (e.g. event `"FundsWithdrawnFromAccount"` may publish a message called `"FundsWithdrawn"`).

     To verify a projection slice, for each inbound event in the spec's readmodel dependencies:

     1. **Find the event type name:** convert the inbound `title` to PascalCase → e.g. `"FundsWithdrawnFromAccount"`.

     2. **Find the messages function:** in the stream factory file (`swimlanes/<context>/index.ts`), locate the `.withMessages("<EventType>", <fn>)` call for that event. Note the function name (e.g. `fundsWithdrawnMessages`) and find its source file in `swimlanes/<context>/messages/`.

     3. **Extract the actual message type string:** in that messages file, find the `EvDbMessage.createFromMetadata(metadata, "<messageType>", ...)` call. The second argument is the message type string the projection will receive (e.g. `"FundsWithdrawn"`).

     4. **Check the projection code:** grep `src/BusinessCapabilities/<context>/slices/<folder>/` for that message type string (not the event type name). If found → message handling is wired.

     5. **Check idempotency alignment:** if the messages file uses `createIdempotencyMessageFromMetadata`, verify the projection uses `ProjectionModeType.Idempotent`. If the messages file does not use it, the projection should not be in Idempotent mode (or if it is, that is a mismatch worth flagging).

     If all checks pass → implementation is verified. If the messages function is absent (no `withMessages` for the event) or the message type string is not found in the projection code → identifiers are missing.

   - **Implicit slice** (no code directory — Review status from Passes 2 or 3): the code scan already confirmed wiring in the earlier pass. Treat as verified.

   If all key identifiers are found → the implementation aligns with the spec. Compute the current config hash and **add it to `implementation-hashes.json`**. Do not change the slice status.

   If significant identifiers are missing → set status to `"Blocked"`. Do not write a hash.

   **Slices with Planned status and no hash**: nothing to do — they haven't been implemented yet.

3. **Write `.eventmodel/implementation-hashes.json`** back if any new hashes were added (2-space indent, keys sorted alphabetically).

---

## Pass 5 — Blocked slice review

After Passes 1–4, revisit every slice in `originallyBlocked`. The goal is to
explain what happened to each one: did the underlying problem get fixed, does
it still exist, or has a different problem surfaced?

### How to determine the original problem

Use the presence/absence of a stored hash (recorded in the Pre-pass step):

| Had stored hash? | Original problem |
|---|---|
| Yes | Spec drift — the spec changed after the slice was implemented |
| No | Missing identifiers — key code identifiers were absent |

### How to determine the current outcome

For each originally-Blocked slice, look at what passes 1–4 did:

**If the slice is now `"Review"`** (passes 1–4 upgraded it):
- **Verdict: Resolved** — the original problem no longer exists.
  - Explain what changed: "implementation directory now found", "hash now
    matches and code verified", "identifiers now present and hash stamped", etc.

**If the slice is now `"Planned"`** (code directory disappeared):
- **Verdict: Regressed** — the implementation was removed entirely.
  - Note the original problem for context, but the current state is simply
    unimplemented.

**If the slice is still `"Blocked"`**:
- Compare the blocking reason now versus the original:

  *Same original problem persists:*
  - Was spec drift → hash still mismatches → **Verdict: Persists (spec drift)**
  - Was missing identifiers → identifiers still absent → **Verdict: Persists
    (identifiers missing)**; name the specific missing identifiers.

  *Different problem emerged:*
  - Was spec drift, hash now matches, but identifiers are now missing →
    **Verdict: Changed** — run a quick identifier scan (same logic as Pass 4b)
    to confirm and name the missing identifiers.
  - Was missing identifiers, identifiers now present, but hash now mismatches
    → **Verdict: Changed** — the spec drifted while the code was being fixed.

  When the verdict is **Changed**, run the additional check needed to confirm
  the new problem, and name it explicitly in the report.

### When to run an extra identifier scan

An extra identifier scan is needed only when a Blocked slice had a stored hash
that NOW matches (spec drift resolved) AND the slice is still Blocked. In that
case, check whether key identifiers are present:
- STATE_CHANGE: grep `slices/` for command name; grep `swimlanes/` for internal
  event type names (skip external events).
- STATE_VIEW projection (code dir exists): follow the full projection
  verification from Pass 4b — find the messages function for the inbound event,
  extract the actual message type string, then grep `slices/<folder>/` for that
  string (not the event type name). Also check idempotency alignment.
- Implicit (Pass 2/3 wiring): already confirmed — treat as present.

If identifiers are missing after the hash resolves, that is the "changed
problem" and should be named specifically in the report.

---

## Write back and report

After all five passes, write the updated object back to
`.eventmodel/.slices/index.json`, preserving all other fields and the original
JSON formatting (2-space indent, same key order).

Also write `.eventmodel/implementation-hashes.json` if Pass 4 added any new entries.

Then output a concise summary:

```
Updated .eventmodel/.slices/index.json:

Pass 1 — direct implementation:
  <context>/<folder>: Planned → Review   (implementation dir found)
  <context>/<folder>: Review → Planned   (implementation dir missing)

Pass 2 — todo-list implicit:
  <context>/<folder>: Planned → Review   (queue-message producer found for <EventType>)
  <context>/<folder>: (skipped — not a todo-list slice)

Pass 3 — automation-processor implicit:
  <context>/<folder>: Planned → Review   (pg-boss endpoint found for <CommandName>)
  <context>/<folder>: (skipped — not an automation-processor slice)

Pass 4 — hash integrity:
  <context>/<folder>: Review → Blocked   (spec changed — stored hash doesn't match current config)
  <context>/<folder>: hash stamped       (no prior hash; code verified against spec)
  <context>/<folder>: Review → Blocked   (no prior hash; key identifiers missing from code)
  <context>/<folder>: hash matches       (no change needed)

Pass 5 — Blocked slice review:
  <context>/<folder>: Blocked → Review   ✓ Resolved
    Was: spec drift (stored hash mismatch)
    Now: hash matches, implementation verified
  <context>/<folder>: still Blocked      ✗ Persists
    Was: missing identifiers (no stored hash)
    Now: <IdentifierName> still absent from swimlanes/
  <context>/<folder>: still Blocked      ⚠ Changed problem
    Was: spec drift (stored hash mismatch)
    Now: hash matches but <IdentifierName> missing from slices/<folder>/
  <context>/<folder>: Blocked → Planned  ↩ Regressed
    Was: missing identifiers (no stored hash)
    Now: implementation directory no longer found

  No Blocked slices.   ← use this line when originallyBlocked is empty

Unchanged (Done): <context>/<folder>, ...
```

If nothing changed in a pass, say so. Always include the Pass 5 section.

---

## Rules

- Never modify slices with `status: "Done"`.
- `"Planned"`, `"Review"`, and `"Blocked"` are the only statuses ever written by this skill.
- Directory matching is case-insensitive.
- Preserve all other fields in the JSON exactly as they are.
- Do not implement, delete, or scaffold any code — only update `index.json` and `implementation-hashes.json`.
- Never update a stored hash when a mismatch is detected — that is evdb-dev's responsibility after reimplementation.
- Every run is a fresh audit. Never reuse grep results, file reads, or directory listings from earlier in the conversation. Always re-execute every tool call. Stale data causes wrong verdicts — this is especially dangerous for Pass 5, where a recently-fixed issue might still appear Blocked if you rely on cached search results.
