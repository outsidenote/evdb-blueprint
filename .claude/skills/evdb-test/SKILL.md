---
name: evdb-test
description: >
  Runs regression tests for evdb-diff and evdb-dev skills using fixture-based
  event model states. Each fixture simulates a real-world model scenario, executes the
  skill in an isolated git worktree, and validates output. Use this skill when the user
  asks to test the evdb skills, run fixtures, validate skill behavior, or check for
  regressions. Trigger for phrases like "test the diff skill", "test evdb-dev",
  "run the fixtures", "check for regressions", or "validate evdb against test data".
---

You are a test runner for evdb skills. You execute test fixtures and report results.

Check the ARGUMENTS passed to this skill:
- `evdb-diff` or empty → run evdb-diff fixtures (deterministic)
- `evdb-dev` → run evdb-dev golden reference test (scaffold + AI)
- `all` → run both
- **anything else** (e.g. `zero-scan`, `my-fixture`) → run that named fixture end-to-end (scaffold + AI fill)

---

## Testing a named fixture (e.g. `/evdb-test zero-scan`)

When the argument is any fixture name that is not `evdb-diff`, `evdb-dev`, or `all`,
run the full end-to-end test for that fixture.

### Step 1: Run the deterministic scaffold layer

```bash
python3 .claude/skills/evdb-test/scripts/run_dev_fixture.py \
  --fixture <fixture-name> --root . --keep-worktree
```

Read the report written to `.claude/test-fixtures/latest/dev-report.md`.

The script:
1. Creates a git worktree at `/tmp/evdb-dev-<fixture-name>`
2. Swaps in the fixture event model (all slices from `eventmodel/` folder)
3. Runs `evdb-scaffold` on every Planned slice
4. Reports scaffold results

### Step 2: AI fill — optimized (pre-fed context, skip diff, skip no-ops)

After scaffold runs, the worktree at `/tmp/evdb-dev-<fixture-name>` has boilerplate
but TODOs in `gwts.ts`, `commandHandler.ts`, or `enrichment.ts`.

**DO NOT invoke the full evdb-dev-v2 skill.** Instead, use the optimized flow below
which skips redundant work (evdb-diff, scaffold re-run, no-op slices).

#### 2a. Read the AI fill manifest

The Python script wrote `.ai-fill-manifest.json` into the worktree:
```
/tmp/evdb-dev-<fixture-name>/.ai-fill-manifest.json
```

Read it. It contains:
- `fillable_slices` — slices with TODO files (these need AI fill)
- `noop_slices` — slices with no TODOs (skip these entirely)
- `learned_hints_path` — path to learned_hints.md

**If `fillable_slices` is empty, skip the entire AI fill step.**

#### 2b. Pre-read context files

For each fillable slice, read these files NOW (before launching the agent):
1. The slice's `TODO_CONTEXT.md` (path is in the manifest's `todo_context_path`)
2. `learned_hints.md` (path is in the manifest's `learned_hints_path`)

Save the file contents — you will inject them into the agent prompt.

#### 2c. Launch one agent with pre-fed context

Launch a **single** Agent with a prompt that includes:
1. The full text of `learned_hints.md`
2. For each fillable slice: the full text of its `TODO_CONTEXT.md`
3. Explicit instructions: **skip evdb-diff, skip scaffold, go straight to filling TODOs**

The agent prompt should follow this template:

```
You are working in /tmp/evdb-dev-<fixture-name>.

SKIP evdb-diff (already done). SKIP scaffold (already done).
Your ONLY job: fill in // TODO placeholders in the files listed below.

## Learned Hints
<paste learned_hints.md content here>

## Slices to fill

### Slice: <folder> (context: <context>)
TODO_CONTEXT:
<paste TODO_CONTEXT.md content here>

Files with TODOs to edit (read each, fill TODOs, save):
- <list from TODO_CONTEXT.md>

### Slice: <next folder> ...
<repeat for each fillable slice>

## After filling all TODOs

For each slice, run the test:
- Standard: node --import tsx --test src/BusinessCapabilities/<Context>/slices/<CmdClass>/tests/command.slice.test.ts
- Enrichment: node --import tsx --test src/BusinessCapabilities/<Context>/endpoints/<CmdClass>/tests/enrichment.test.ts

If a test fails, fix the code and re-run. Do NOT read existing blueprint slices.

Also start+stop a scan session per slice:
  python3 <root>/.claude/skills/evdb-dev-v2/scripts/scan_session.py start --slice <folder> --context <context> --root .
  ... (do the fill work) ...
  python3 <root>/.claude/skills/evdb-dev-v2/scripts/scan_session.py assert
  python3 <root>/.claude/skills/evdb-dev-v2/scripts/scan_session.py stop
```

This eliminates ~15 discovery reads per slice (the agent starts editing immediately).

### Step 3: Run the tests

After AI fill, run tests in the worktree:

```bash
node --import tsx --test \
  $(find /tmp/evdb-dev-<fixture-name>/src -name "command.slice.test.ts" -o -name "view.slice.test.ts" 2>/dev/null | tr '\n' ' ')
```

Or look up test file paths from the scaffold report.

### Step 4: Check scan violations

```bash
python3 .claude/skills/evdb-dev-v2/scripts/scan_session.py report
```

Assert: 0 violations.

### Step 5: Cleanup

```bash
git worktree remove /tmp/evdb-dev-<fixture-name> --force
git branch -D evdb-test-<fixture-name>
```

### Step 6: Final report

Present to user:
- Fixture name and list of Planned slices tested
- Scaffold: OK or FAILED (per slice)
- AI fill: which files were filled
- Tests: pass count / fail count
- Scan violations: count
- **Performance & cost summary** (ALWAYS include):

| Metric | Value |
|---|---|
| Scaffold duration | from Python script output |
| AI fill duration | `<end_time - start_time>` seconds (record `date +%s` before/after Agent call) |
| AI fill tokens | `<total_tokens>` from Agent tool usage metadata |
| AI fill tool calls | `<tool_uses>` from Agent tool usage metadata |
| Model | Report which model was used (check the parent conversation's model) |
| Est. cost (Opus) | `(total_tokens * 0.8 * 15 + total_tokens * 0.2 * 75) / 1_000_000` |
| Est. cost (Sonnet) | `(total_tokens * 0.8 * 3 + total_tokens * 0.2 * 15) / 1_000_000` |

- Overall: PASS or FAIL

**PASS criteria**: all scaffolds succeeded, all tests pass, 0 scan violations.

---

## Testing evdb-diff

Use the deterministic Python script:

```bash
python3 .claude/skills/evdb-test/scripts/run_fixtures.py --root .
```

For specific fixtures:
```bash
python3 .claude/skills/evdb-test/scripts/run_fixtures.py --root . --fixtures baseline,new-slice
```

After the script returns, read `.claude/test-fixtures/latest/report.md` and present results.

---

## Testing evdb-dev (golden reference test)

This tests that evdb-dev-v2 generates correct, working code by comparing against the
existing blueprint code. You orchestrate this directly — no Python script needed for
the generation step.

### Available fixtures

Fixtures in `.claude/test-fixtures/` that have a `slices/` folder with slice.json files
AND whose target slice already has implemented code in `src/BusinessCapabilities/`.

| Fixture | Slice | What it tests |
|---|---|---|
| `golden-approvewithdrawal` | `withdrawalapproval` | STATE_CHANGE with spec, dual events, predicate logic |

### Steps to execute (follow exactly)

**Step 1: Create worktree**
```bash
git worktree add /tmp/evdb-golden-test -b evdb-golden-test HEAD
```

**Step 2: Identify the target slice**

Read the fixture's `index.json` to find which slice has status `"Planned"`. That's the
slice to test. Read its `slice.json` to get the command title (drives naming).

**Step 3: Snapshot the golden reference**

The existing code in the worktree IS the golden reference. Before deleting anything,
read every file that belongs to this slice and save their contents. The files are:

- `src/BusinessCapabilities/<Context>/slices/<SliceName>/*.ts` and `tests/*.ts`
- `src/BusinessCapabilities/<Context>/endpoints/<SliceName>/REST/index.ts`
- `src/BusinessCapabilities/<Context>/swimlanes/<Stream>/events/<EventName>.ts` (this slice's events)
- `src/BusinessCapabilities/<Context>/swimlanes/<Stream>/views/SliceState<SliceName>/*.ts`

Use the Read tool to capture each file's content.

**Step 4: Delete the slice code**

Delete all the files you just snapshotted. Do NOT delete shared files (stream factory,
routes.ts, FundsViews.ts).

**Step 5: Swap in fixture event model**

```bash
cp .claude/test-fixtures/<fixture>/config.json /tmp/evdb-golden-test/.eventmodel/config.json
cp .claude/test-fixtures/<fixture>/index.json /tmp/evdb-golden-test/.eventmodel/.slices/index.json
```

And copy any `slices/` folder contents into the worktree's `.eventmodel/.slices/`.

**Step 6: Invoke evdb-dev-v2 skill**

Call the `/evdb-dev-v2` skill to implement the planned slice. This will:
1. Run evdb-diff
2. Run the scaffold (deterministic boilerplate)
3. Fill in business logic TODOs

Record the **start time** before invoking (use `date +%s` via Bash).
Wait for it to complete.
Record the **end time** after it completes.

The Agent tool returns usage metadata (`total_tokens`, `duration_ms`, `tool_uses`).
Capture these values for the report.

**Step 7: Diff against golden reference**

For each file you snapshotted in Step 3, read the regenerated version and compare.
Report for each file:
- **EXACT_MATCH** — identical (ignoring trailing whitespace)
- **SEMANTIC_MATCH** — same logic, cosmetic differences (comments, whitespace, naming)
- **DIFFERS** — different logic or structure
- **MISSING** — file was not regenerated

**Step 8: Run the tests**

```bash
cd /tmp/evdb-golden-test && node --import tsx --test <test-file-paths>
```

Report: did the tests pass?

**Step 9: Cleanup**

```bash
git worktree remove /tmp/evdb-golden-test --force
git branch -D evdb-golden-test
```

**Step 10: Report**

Present results to the user:
- Table of files: golden vs generated, match status
- For DIFFERS files: show the key differences
- Tests: PASS or FAIL
- If tests fail: show the error output
- **Performance & cost summary** (always include):

| Metric | Value |
|---|---|
| Duration | `<end_time - start_time>` seconds |
| Total tokens | `<total_tokens>` from agent usage |
| Tool calls | `<tool_uses>` from agent usage |
| Model | Report which model was used |
| Est. cost (Opus) | Compute: `(total_tokens * 0.8 * 15 + total_tokens * 0.2 * 75) / 1_000_000` |
| Est. cost (Sonnet) | Compute: `(total_tokens * 0.8 * 3 + total_tokens * 0.2 * 15) / 1_000_000` |

If breakdown unavailable, estimate 80% input / 20% output. Report both costs so the user can see the difference.

### What constitutes a PASS

The test passes when:
1. **All files are generated** — no MISSING files
2. **Tests pass** — the generated code is functionally correct
3. **Deterministic files are exact matches** — command.ts, events, adapter.ts

Cosmetic differences in AI-generated files (comments, whitespace, naming style) are
acceptable as long as tests pass. Report them as SEMANTIC_MATCH.

### What to do on failure

If tests fail or files are missing:
- Check if the scaffold generated the files → if not, the scaffold has a bug
- Check if the AI filled in TODOs → if not, the evdb-dev-v2 prompt needs adjustment
- Check if the business logic is wrong → if so, the skill instructions need fixing
- Report the specific failure so the user can decide what to fix

---

## Rules

- Never modify fixture files or expected-diff.json based on failures without user approval
- Present failures clearly with what went wrong and what to fix
- Always clean up worktrees after testing
- For evdb-dev tests, the golden reference is the existing blueprint code — no expected-dev.json needed
