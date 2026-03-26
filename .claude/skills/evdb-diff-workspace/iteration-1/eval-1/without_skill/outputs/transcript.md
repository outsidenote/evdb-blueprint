# Transcript: evdb-diff action list (without skill)

## Approach

The task was to show the evdb-diff action list for the event model. Without a specific skill, I explored the repository to understand what an "evdb-diff" means in context.

## Steps Taken

### 1. Explored the event model directory

Read `.eventmodel/.slices/index.json` to understand the structure. Found 11 slices under the `Funds` context.

### 2. Read individual slice files

Read several slice JSON files (`funddeposit/slice.json`, `withdrawfunds/slice.json`, `withdrawaldeclinenotified/slice.json`) to understand the structure of commands, events, readmodels, and processors.

### 3. Examined git diff

Used `git diff HEAD -- .eventmodel/` to identify what changed. Key findings:
- `.eventmodel/.slices/index.json`: One new slice added — `slice: Withdrawal Decline Notified` (folder: `withdrawaldeclinenotified`, context: `Funds`)
- `.eventmodel/.slices/Funds/withdrawfunds/slice.json`: Fields reordered in `Funds Withdrawal Declined` event; new outbound dependency to `withdrawal declines` readmodel added
- `.eventmodel/config.json`: Same changes mirrored

### 4. Discovered the evdb-diff skill definition

Found `.claude/wip/evdb-diff.md` which defines the exact algorithm for evdb-diff:
- Run `git diff HEAD -- .eventmodel/.slices/index.json`
- Lines with `+` containing a `"folder"` key = added slice → action `"implement"`
- Lines with `-` containing a `"folder"` key = removed slice → action `"delete"`
- Order: delete actions first, then implement actions

### 5. Applied the algorithm

From the diff of `.eventmodel/.slices/index.json`:

**Added** (lines prefixed `+`):
```json
{
  "id": "3458764665346461849",
  "slice": "slice: Withdrawal Decline Notified",
  "index": 21,
  "context": "Funds",
  "folder": "withdrawaldeclinenotified",
  "status": "Review"
}
```

**Removed**: none

## Result

```json
[
  {
    "slice": "slice: Withdrawal Decline Notified",
    "folder": "withdrawaldeclinenotified",
    "context": "Funds",
    "action": "implement"
  }
]
```
