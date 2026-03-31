---
name: evdb-test
description: >
  Runs deterministic regression tests for evdb-diff and evdb-dev using fixture-based
  event model states. Each fixture simulates a real-world model scenario, executes the
  skill in an isolated git worktree, and validates output against expected statuses,
  actions, and assertions. Produces structured pass/fail reports (MD, HTML, JSON) for
  CI integration and regression detection. Use this skill when the user asks to test
  the evdb skills, run fixtures, validate skill behavior, or check for regressions.
  Trigger for phrases like "test the diff skill", "run the fixtures", "check for
  regressions", or "validate evdb-diff against test data".
---

You are a test runner for the evdb-diff skill. You execute test fixtures and report results.

You do not run fixtures manually. You must use the `scripts/run_fixtures.py` script.

---

## How to run

**Run all fixtures:**
```bash
python3 .claude/skills/evdb-test/scripts/run_fixtures.py --root .
```

**Run specific fixtures:**
```bash
python3 .claude/skills/evdb-test/scripts/run_fixtures.py --root . --fixtures baseline,new-slice
```

The script:
1. Creates an isolated git worktree per fixture
2. Swaps in the fixture's event model files
3. Runs `evdb_diff.py` deterministically
4. Compares output against `expected-diff.json`
5. Tears down the worktree
6. Generates reports at `.claude/test-fixtures/latest/`

---

## Output

Every run produces three files in `.claude/test-fixtures/latest/`:

| File | Purpose |
|---|---|
| `report.md` | Human-readable markdown report |
| `report.html` | Visual report — open in browser |
| `ci-report.json` | Machine-readable for CI/CD integration |

Each fixture also gets detailed results in `.claude/test-fixtures/latest/<fixture>/`.

---

## After the script returns

1. Read `report.md` and present the results to the user
2. If all passed — confirm and show the summary line
3. If failures exist — for each failure:
   - Show the slice, expected vs actual status
   - Show the explanation (what went wrong)
   - Show the recommendation (how to fix it)
4. If the user wants to see the visual report, open `report.html`

---

## Rules

- Never run fixtures manually — always use the script
- Never modify expected-diff.json based on failures without user approval
- Present failures clearly with explanations and recommendations
- The script handles all worktree creation and teardown automatically
