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

## Pipeline (4 steps — follow this order exactly)

### Step 0: Start scan session

Before doing anything else, start a scan session for the slice you are about to implement.
This activates the zero-scan guard so every file read is logged.

```bash
python3 .claude/skills/evdb-dev-v2/scripts/scan_session.py start \
  --slice <folderName> \
  --context <context> \
  --root .
```

Example: `python3 .claude/skills/evdb-dev-v2/scripts/scan_session.py start --slice funddeposit --context Funds --root .`

If you do not know the slice yet, run Step 1 first to find the Planned slice, then come
back and start the session before Step 2.

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

**3a. Read learned hints first**

Before reading anything else, read the learned hints file:

```
.claude/skills/evdb-dev-v2/learned_hints.md
```

This file contains domain patterns discovered from previous slice implementations —
predicate conditions, computed field formulas, test data patterns. Apply matching hints
directly. Do not scan existing code to verify them.

**3b. Read TODO_CONTEXT.md**

Read `slices/<SliceName>/TODO_CONTEXT.md`. This single file contains everything else:
spec details, computed field hints, file list, and structural patterns.
Do NOT read `slice.json`, `references/templates.md`, or existing blueprint code separately.

**3c. Fill in TODOs**

Read and edit only the files listed in `TODO_CONTEXT.md` under "Files with TODOs":

| File | What to fill in |
|---|---|
| `gwts.ts` | Replace `return false` stubs with real predicate conditions |
| `commandHandler.ts` | Fill in branching logic and computed field values (reason strings, formulas) |
| `tests/command.slice.test.ts` | Verify all event interface fields are present. Fix `expectedEvents` if needed |
| `views/SliceState*/view.slice.test.ts` | Fix accumulation vs overwrite logic |

**3d. Run the tests**

```bash
node --import tsx --test src/BusinessCapabilities/<Context>/slices/<SliceName>/tests/command.slice.test.ts
```

If tests **fail**:
1. Read the failure output — identify exactly which assertion failed and why
2. Fix the code (do NOT scan existing slices — reason from the error + TODO_CONTEXT.md)
3. Re-run until green
4. For each fix that was non-obvious, encode it immediately:
   ```bash
   python3 .claude/skills/evdb-dev-v2/scripts/scan_learn.py from-failure \
     --fix "<what you fixed and why>"
   ```

**Rules for Step 3:**
- **Read learned_hints.md first** — apply matching patterns before looking at TODO_CONTEXT.md
- **Read TODO_CONTEXT.md second** — it replaces reading slice.json + reference files + existing code
- DO NOT read existing blueprint code for patterns — if a hint is missing, encode it after the run
- DO NOT recreate files the scaffold already created correctly (command.ts, adapter.ts, events, endpoint)
- DO NOT change the file structure or naming the scaffold chose

### Step 4: Assert zero scans and stop session

After the tests pass, run the assertion and close the session:

```bash
python3 .claude/skills/evdb-dev-v2/scripts/scan_session.py assert
python3 .claude/skills/evdb-dev-v2/scripts/scan_session.py report
python3 .claude/skills/evdb-dev-v2/scripts/scan_session.py stop
```

**If `assert` exits with code 1 (violations found):**
1. Run `report` to see which files were scanned
2. For each violation: ask "what pattern was I looking for in that file?"
3. Encode the answer:
   ```bash
   python3 .claude/skills/evdb-dev-v2/scripts/scan_learn.py from-violation \
     --file "<scanned file path>" \
     --reason "<what pattern you were looking for>"
   ```
4. Re-run from Step 0 — goal is zero violations on the next attempt

**After every successful run (zero violations, tests green):**

Reflect: was anything you figured out NOT already in `learned_hints.md` or `TODO_CONTEXT.md`?
If yes — encode it so the next slice benefits:

```bash
python3 .claude/skills/evdb-dev-v2/scripts/scan_learn.py append \
  --category "<Predicates | Computed fields | Test cases | View state>" \
  --hint "<the pattern, concisely>" \
  --slice <sliceName>
```

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
