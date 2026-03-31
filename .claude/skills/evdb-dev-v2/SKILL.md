---
name: evdb-dev-v2
description: >
  Scaffold-first backend developer skill for the eventualize-js (evdb) blueprint pattern.
  Uses a 3-step pipeline: (1) evdb-diff audits statuses, (2) evdb-scaffold deterministically
  generates all boilerplate TypeScript files, (3) you fill in business logic TODOs only.
  Use this skill whenever the user asks to implement a slice, add a feature, or generate
  code from the event model. This is the v2 of evdb-dev — same output, less AI work.
---

You are an expert backend developer specialising in event-sourced, CQRS systems built
with the **eventualize-js (evdb) framework**. The `.eventmodel/` folder is the **single
source of truth** — implement only what is modelled there.

---

## Pipeline (3 steps — follow this order exactly)

### Step 1: Invoke `evdb-diff`

Run the evdb-diff skill and wait for it to complete. This audits the codebase and updates
every slice status in `.eventmodel/.slices/index.json`.

### Step 2: Run the scaffold tool

For each `"Planned"` slice, run the deterministic scaffold generator:

```bash
python3 .claude/skills/evdb-scaffold/scripts/evdb_scaffold.py --root . --slice <folder>
```

This generates **all boilerplate files** deterministically with no AI:
- Event interfaces (`swimlanes/<Stream>/events/<EventName>.ts`)
- Command interface (`slices/<SliceName>/command.ts`)
- GWTS predicate stubs (`slices/<SliceName>/gwts.ts`)
- Command handler skeleton (`slices/<SliceName>/commandHandler.ts`)
- Adapter (`slices/<SliceName>/adapter.ts`)
- REST endpoint (`endpoints/<SliceName>/REST/index.ts`)
- Test skeleton (`slices/<SliceName>/tests/command.slice.test.ts`)
- SliceState view state + handlers (if specs have `given` events)
- Updates to stream factory, views type, and routes

The scaffold leaves `// TODO` placeholders in files that need business logic.

### Step 3: Fill in business logic (your job)

After the scaffold runs, **read `slices/<SliceName>/TODO_CONTEXT.md`** first. This single file
contains everything you need: spec details, computed field hints, file list, and patterns.
Do NOT read `slice.json`, `references/templates.md`, `references/tests.md`, or existing
blueprint code separately — `TODO_CONTEXT.md` has it all.

Then read and edit only the files listed in `TODO_CONTEXT.md` under "Files with TODOs":

| File | What to fill in |
|---|---|
| `gwts.ts` | Replace `return false` stubs with real predicate conditions (hints are in the TODO comments). |
| `commandHandler.ts` | Fill in computed event fields (hints with example values are in the TODO comments). |
| `tests/command.slice.test.ts` | Verify test payloads include ALL fields from the event interface. Fix `expectedEvents` if needed. |
| `views/SliceState*/view.slice.test.ts` | Fix accumulation logic in the scaffold-generated test if state accumulates rather than overwrites. |

**Rules for Step 3:**
- **Read `TODO_CONTEXT.md` first** — it replaces reading slice.json + reference files + existing code
- DO NOT recreate files the scaffold already created correctly (command.ts, adapter.ts, events, endpoint)
- DO NOT change the file structure or naming the scaffold chose
- DO NOT read existing blueprint code for patterns — the TODO comments and TODO_CONTEXT.md have everything
- DO ensure the generated tests actually pass by running: `node --import tsx --test <test-file>`

---

## What the scaffold handles vs what you handle

| Artifact | Scaffold (deterministic) | You (AI) |
|---|---|---|
| Event interfaces | ✅ Complete | — |
| Command interface | ✅ Complete | — |
| Adapter | ✅ Complete | — |
| REST endpoint | ✅ Complete | — |
| Stream factory updates | ✅ Complete | — |
| Views type updates | ✅ Complete | — |
| Routes updates | ✅ Complete | — |
| GWTS predicates | Structure only | Fill in condition logic |
| Command handler | Structure + field mapping | Fill in branching logic, reason strings |
| View state | Generic shape | Fix if predicates need specific fields |
| View handlers | Generic spread | Fix event names, accumulation logic |
| Tests | Structure + some data | Fix test data, add missing scenarios |
| View tests | Skeleton with TODOs | Fix accumulation vs overwrite logic |
| TODO_CONTEXT.md | Complete | Read-only — your guide for Step 3 |

---

## Reference Files

The scaffold generates `TODO_CONTEXT.md` with all patterns inline. You should NOT need
to read these reference files. Only read them as a fallback if `TODO_CONTEXT.md` is missing:

- **`references/templates.md`** in the `evdb-dev` skill — TypeScript templates
- **`references/tests.md`** in the `evdb-dev` skill — Test file templates

---

## Key Conventions

All conventions from `evdb-dev` apply. The critical ones for Step 3:

- **Pure handlers**: `commandHandler.ts` never imports storage, I/O, or time. Only `stream.appendEvent*()`.
- **GWTS predicates**: each spec branch gets a named predicate matching `spec.comments[0].description`.
- **Generated fields**: computed in endpoints only — never in the pure handler.
- **appendEvent syntax**: `stream.appendEvent${EventName}({ ...fields })` — plain payload object.
- **View state**: minimum state the predicates need. Read from `stream.views.SliceState<SliceName>`.
- **`.js` extensions**: all relative imports use `.js` even for `.ts` source files.
