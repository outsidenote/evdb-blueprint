---
name: evdb-diff
description: >
  Compares the working-tree `.eventmodel/.slices/index.json` against HEAD to identify which
  slices were added (need implementation) or removed (code needs deletion), and outputs a
  precise JSON action list. Use this skill whenever the user wants to know what changed in
  the event model, what needs to be implemented or deleted, what slices are new or removed,
  or asks for a diff/delta/action list from the event model index. Trigger even if the user
  just says "what changed?" or "what do I need to implement?" in the context of this evdb
  project.
---

You are a diff analyst for an event-sourced system built with the **eventualize-js (evdb)
framework**. Your job is to compare the working-tree `.eventmodel/.slices/index.json`
against the latest commit on the current branch (HEAD) and produce a precise action list.

---

## Steps

### 1. Get the diff

Run:
```
git diff HEAD -- .eventmodel/.slices/index.json
```

This compares the locally modified (or unmodified) file against `HEAD` — the latest commit
on the current branch. It captures any local edits that have not yet been committed.

If the output is empty, the file has not changed since the last commit. Check whether the
file exists at HEAD:
```
git show HEAD:.eventmodel/.slices/index.json 2>/dev/null
```
- If it exists at HEAD and the diff is empty → no changes, return `[]`.
- If it does **not** exist at HEAD (file is untracked/new) → read the current
  `.eventmodel/.slices/index.json` and treat every slice as `"implement"`.

If there is no commit at all in the repo, read the current `.eventmodel/.slices/index.json`
and treat every slice as `"implement"`.

### 2. Parse the diff

From the unified diff output:
- Lines prefixed with `+` (added) that contain a `"folder"` key → the slice was **added**
  → action: `"implement"`
- Lines prefixed with `-` (removed) that contain a `"folder"` key → the slice was
  **removed** → action: `"delete"`
- Lines with no prefix (context lines) → unchanged → ignore

Each slice object in `index.json` spans multiple lines. A slice is considered **added** if
its `"id"` line is new (prefixed `+`). A slice is considered **removed** if its `"id"` line
is gone (prefixed `-`).

Use the `folder`, `slice`, and `context` fields from the changed lines to populate the
output.

### 3. Output

Return **only** a JSON array — no prose, no markdown fences, no explanation. Each element:

```json
{
  "slice": "<value of the slice field>",
  "folder": "<value of the folder field>",
  "context": "<value of the context field>",
  "action": "implement" | "delete"
}
```

If there are no changes, return an empty array: `[]`

---

## Rules

- Do not implement or delete anything — only report.
- Do not read any slice JSON files; only the diff of `index.json` is needed.
- The `folder` value maps to the directory name under `.eventmodel/.slices/<context>/`.
- The `context` value maps to the directory name under `src/BusinessCapabilities/`.
- Order the output: `"delete"` actions first, then `"implement"` actions.
