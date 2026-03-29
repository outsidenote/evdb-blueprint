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

There are three passes: a **direct scan** (does a code directory exist?), a
**todo-list scan** (is the slice implicitly satisfied by a message producer
elsewhere?), and an **automation-processor scan** (is the slice implicitly
wired by a pg-boss endpoint for the command it delegates to?). All passes
respect the "Done" invariant — never touch those.

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

## Write back and report

After all three passes, write the updated object back to
`.eventmodel/.slices/index.json`, preserving all other fields and the original
JSON formatting (2-space indent, same key order).

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

Unchanged (Done): <context>/<folder>, ...
```

If nothing changed in a pass, say so.

---

## Rules

- Never modify slices with `status: "Done"`.
- Only `"Planned"` and `"Review"` are ever written by this skill.
- Directory matching is case-insensitive.
- Preserve all other fields in the JSON exactly as they are.
- Do not implement, delete, or scaffold any code — only update `index.json`.
