# CI Code Generation Pipeline — Architecture Review

## Problem

When a team member exports an event model from Miro, the resulting `config.json` contains slice definitions (commands, events, read models, specifications) that need to be translated into working TypeScript code. Today this is done manually, slice by slice, which is slow and error-prone.

## Solution

An automated CI pipeline that takes a Miro export and produces a pull request with fully implemented slice code — ready for human review.

---

## How It Works

```
    Miro Board
        │
        │  export
        v
   config.json ──push to main──> GitHub Actions
        │
        ├── Phase 1: Deterministic (Python, no AI)
        │     split config → audit statuses → scaffold boilerplate
        │
        ├── Phase 2: AI (Claude Code CLI)
        │     fill predicates → fill handler logic → run tests
        │
        └── Phase 3: Output
              commit → PR per business context
```

### Phase 1 — Deterministic (no AI, no cost, ~2 seconds)

| Step | What | Input | Output |
|------|------|-------|--------|
| Split | Break monolithic config into per-slice files | `config.json` | `index.json` + `<Context>/<folder>/slice.json` |
| Diff | Audit codebase to determine which slices need implementation | `index.json` + `src/BusinessCapabilities/` | Slice statuses: Planned, Review, Blocked, Done |
| Scaffold | Generate all TypeScript boilerplate for Planned/Created slices | `slice.json` | command, handler, events, views, adapter, endpoint, tests — all with correct types, field names, wiring |

**Scaffold generates ~80% of the code deterministically.** The remaining 20% requires reasoning about business rules.

### Phase 2 — AI (Claude Code, ~1-5 min per context, ~$0.50-2.00)

Claude Code reads the scaffold's `TODO_CONTEXT.md` and fills in:

| File | What AI Fills In | Example |
|------|-----------------|---------|
| `gwts.ts` | Predicate logic | `balance < command.amount` → insufficient funds |
| `commandHandler.ts` | Branching between events, computed field formulas | if insufficient → decline, else → approve |
| `enrichment.ts` | Cross-boundary data lookups (when applicable) | Frankfurter API for exchange rates |
| `tests/` | Validates test data against spec examples | Assertion values match GWT scenarios |

### Phase 3 — PR

One PR per business context (e.g. `codegen/Funds`, `codegen/Reporting`). Each PR includes:
- All generated slice code
- Verification results (contract checks)
- Passing test suite
- Review checklist

---

## Safety Controls

| Control | Purpose |
|---------|---------|
| **Content hash gate** | Only triggers when slice *definitions* change — not when statuses or metadata are updated |
| **evdb-verify** | Post-generation contract check: validates field names, types, event count, handler structure against spec |
| **Slice tests** | GWT-driven unit tests must pass before PR is created |
| **Human review** | PR is created, not merged — architect reviews predicates, branching, computed fields |
| **Deterministic scaffold** | 80% of code is generated without AI — reproducible, auditable |

---

## What Changes vs. Current Workflow

| Before | After |
|--------|-------|
| Developer manually reads slice.json and writes each file | Scaffold generates all boilerplate automatically |
| Developer implements predicates, handlers, tests by hand | AI fills business logic, developer reviews PR |
| One slice at a time, sequential | All planned slices per context in parallel |
| No contract verification until code review | Automated verification before PR is opened |

---

## Trigger Rules

| Scenario | Triggers Pipeline? |
|----------|-------------------|
| New Miro export pushed (new slices in config.json) | Yes |
| Developer edits business code in `src/` | No |
| evdb-diff updates slice statuses | No |
| config.json touched but slice definitions unchanged | No (hash gate) |
| Manual trigger from GitHub Actions tab | Yes |

---

## Generated Code Structure

For a slice like "Exchange Rate Calculator" in the Reporting context:

```
src/BusinessCapabilities/Reporting/
├── slices/
│   └── ExchangeRateCalculator/
│       ├── command.ts              ← interface, all fields typed
│       ├── commandHandler.ts       ← pure function, no I/O
│       ├── adapter.ts              ← stream wiring
│       ├── gwts.ts                 ← predicate functions
│       └── tests/
│           └── command.slice.test.ts
├── endpoints/
│   └── ExchangeRateCalculator/
│       └── pg-boss/index.ts        ← automation worker
├── swimlanes/
│   └── Reporting/
│       ├── index.ts                ← stream factory
│       ├── events/
│       │   └── ExchangeRateCalculated.ts
│       └── views/
│           └── SliceStateExchangeRateCalculator/
│               ├── state.ts
│               └── handlers.ts
└── endpoints/
    ├── routes.ts
    └── automations.ts
```

---

## Validation Checklist for Review

### Architecture

- [ ] Pipeline only generates code for slices with `Planned` or `Created` status — never overwrites `Review`/`Done` slices
- [ ] Each business context gets its own PR and branch — no cross-context coupling
- [ ] Scaffold output matches existing hand-written slices in structure and conventions
- [ ] AI-generated business logic is isolated to 4 files: gwts.ts, commandHandler.ts, enrichment.ts, tests

### Safety

- [ ] No code is merged automatically — PR requires human approval
- [ ] Contract verification (evdb-verify) catches structural drift between spec and code
- [ ] Hash gate prevents false triggers and wasted API spend
- [ ] API key is stored as GitHub secret, never in code

### Correctness

- [ ] Predicate stubs are replaced with real logic that matches spec scenarios
- [ ] Command handler branches match the number of THEN outcomes in specifications
- [ ] Generated fields (timestamps, UUIDs, computed values) are set at the endpoint layer, not in the handler
- [ ] View state accumulation vs overwrite logic is correct for each event type

---

## Tested

Pipeline validated locally using `act` (GitHub Actions local runner):

- Phase 1: Scaffolded 2 Reporting slices in ~2 seconds
- Phase 2: Claude Code filled business logic in 1m 27s
- All slice tests passed
- Generated code: commandHandler field mapping, Frankfurter API enrichment, EUR shortcut logic
