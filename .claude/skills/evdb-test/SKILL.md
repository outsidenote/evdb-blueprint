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
| Est. cost | Compute from tokens using: input @ $3/MTok, output @ $15/MTok (claude-sonnet-4-6). If breakdown unavailable, estimate 80% input / 20% output. |

Use this formula for cost estimate:
```
cost = (total_tokens * 0.8 * 3 + total_tokens * 0.2 * 15) / 1_000_000
```

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
