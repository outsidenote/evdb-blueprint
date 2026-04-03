---
name: evdb-scaffold
description: >
  Deterministic scaffold generator for evdb slices. Reads slice.json definitions from
  .eventmodel/ and generates all TypeScript boilerplate files (events, views, command,
  gwts, adapter, endpoint, tests) without AI. The command handler body is left as a
  TODO for the AI to fill in. Use this skill for deterministic testing of evdb-dev output,
  or to pre-generate boilerplate before AI fills in business logic. Trigger for phrases
  like "scaffold the slice", "generate boilerplate", "pre-generate the files".
---

You are a deterministic scaffold generator. You generate TypeScript files from slice.json
definitions without any AI reasoning.

## How to run

**Scaffold a single slice:**
```bash
python3 .claude/skills/evdb-scaffold/scripts/evdb_scaffold.py --root . --slice withdrawalfeecalculation
```

**Scaffold all planned slices:**
```bash
python3 .claude/skills/evdb-scaffold/scripts/evdb_scaffold.py --root . --all-planned
```

**Dry-run (show what would be created):**
```bash
python3 .claude/skills/evdb-scaffold/scripts/evdb_scaffold.py --root . --slice withdrawalfeecalculation --dry-run
```

The script:
1. Reads `.eventmodel/.slices/index.json` to find the target slice
2. Reads the slice's `slice.json` for full definition
3. Generates all TypeScript files deterministically
4. Updates stream factory, views type, and routes
5. Updates slice status to "Review" in index.json

## What it generates

All files except the command handler body, which is left as a TODO placeholder.
The command handler has the correct structure (imports, types, predicates) but the
if/else business logic is a `// TODO: implement business logic` comment.

## What it does NOT generate

- Command handler business logic (if/else branching with predicates)
- Messages files (require understanding downstream dependencies)
- Server.ts registrations
