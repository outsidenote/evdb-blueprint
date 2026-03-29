---
name: evdb-dev
description: >
  Backend developer skill for the eventualize-js (evdb) blueprint pattern. Implements
  event-sourced CQRS slices from the .eventmodel folder, one slice at a time. Use this
  skill whenever the user asks to implement a slice, add a feature to this evdb project,
  generate code from the event model, build a command handler or projection, or asks
  anything about writing code that maps to the .eventmodel structure. Trigger even for
  casual asks like "implement this slice", "build the X feature", or "what do I need to
  code next?" when working in this evdb project.
---

You are an expert backend developer specialising in event-sourced, CQRS systems built
with the **eventualize-js (evdb) framework**. The `.eventmodel/` folder is the **single
source of truth** — implement only what is modelled there.

---

## SDLC Workflow

1. **Invoke the `evdb-diff` skill first** and wait for it to complete before doing anything else.
   `evdb-diff` audits the codebase against `.eventmodel/.slices/index.json` and updates every
   slice's `status` to reflect the true implementation state. Only after it finishes will the
   index accurately reflect what still needs to be built.

2. **Read `.eventmodel/.slices/index.json`** and collect every slice whose `status` is
   `"Planned"`. These are the only slices to work on. Ignore slices with any other status
   (`"InProgress"`, `"Review"`, `"Done"`, `"Blocked"`).

3. Work through the `"Planned"` list in order (ascending `index`).
4. Work **one slice at a time**. Set status `"InProgress"` before starting, `"Review"` when done.
5. **Slices are immutable.** To change a slice: delete it, then recreate from the event model.

### Slice Status Lifecycle

| Status | Meaning |
|---|---|
| `"Created"` | Specified in the model, not yet reviewed |
| `"Planned"` | Reviewed — knows what needs to be built |
| `"InProgress"` | Being implemented right now |
| `"Review"` | Complete, ready for human review |

---

## Event Model Structure

```
.eventmodel/
├── config.json                  ← all slices inline (large — avoid reading whole file)
├── .slices/
│   └── <Context>/
│       └── <sliceFolder>/
│           └── slice.json       ← per-slice detail
└── .slices/index.json           ← slice list: id, title, context, folder, status
```

`context` maps directly to `src/BusinessCapabilities/<context>/`.

---

## Recognising Patterns from the Event Model Graph

Classify each slice before writing any code.

### Pattern 1: REST Request/Response
**Signal**: `SCREEN → COMMAND → EVENT → READMODEL`, read model has no outbound dependency
to another screen in a different slice.
**Code**: REST POST endpoint. The read model lives inside the EvDbStream as a view.

### Pattern 2: Stream View (same swimlane)
**Signal**: A `READMODEL` with multiple `INBOUND EVENT` deps all from the **same swimlane**.
**Code**: In-process view inside the EvDbStream — `views/<ViewName>/state.ts` + `handlers.ts`.

### Pattern 3: Kafka Projection (multiple swimlanes)
**Signal**: A `READMODEL` with `INBOUND EVENT` deps from **different swimlanes** AND **no** `"todoList": true` field.
**Code**: Each populating event emits a Kafka message; a projection slice consumes and writes to SQL.
Before writing the projection, read the messages file for each inbound event to determine the **message type string**
(the second argument of `EvDbMessage.createFromMetadata()`). This is the key used in the projection's `handlers` object
and can differ from the event type name. Also check whether `createIdempotencyMessageFromMetadata` is used — if so,
the projection must use `ProjectionModeType.Idempotent`.

### Pattern 4: TODO-List Read Model (pg-boss queue feed)
**Signal**: A `READMODEL` with `"todoList": true` in the slice JSON, OR with an `OUTBOUND AUTOMATION` dependency in the graph.
`"todoList": true` is the authoritative indicator — it overrides any multi-swimlane heuristic. When in doubt, check the slice JSON field.
**Code**: pg-boss queue, populated via `createPgBossQueueMessageFromEvent` in the outbox message producer.
No `ProjectionConfig` or Kafka projection is created for these — the read model is implicit in the pg-boss queue.

### Pattern 5: Automation (event-driven command handler)
**Signal**: A `PROCESSOR` with `type: "AUTOMATION"`, `INBOUND READMODEL`, `OUTBOUND COMMAND`.
**Code**: pg-boss worker — structurally identical to a REST endpoint but triggered by a job.

---

## Slice JSON → Code Element Mapping

### Slice Types

| `sliceType` | Pattern | Code artifacts |
|---|---|---|
| `STATE_CHANGE` | Command handler | `command.ts`, `commandHandler.ts`, `adapter.ts` + endpoint; `gwts.ts` only if `specifications[]` is non-empty |
| `STATE_VIEW` | Kafka projection | `slices/<Name>/index.ts` with `ProjectionConfig` |
| `UNDEFINED` | Pure processor | pg-boss endpoint only |

### Element Types

| JSON element | Code artifact |
|---|---|
| `commands[]` | `slices/<SliceName>/command.ts` |
| `events[]` | `swimlanes/<Stream>/events/<EventName>.ts` |
| `readmodels[]` — same swimlane | `swimlanes/<Stream>/views/<ViewName>/state.ts` + `handlers.ts` |
| `readmodels[]` — `"todoList": true` | outbox message producer only (`createPgBossQueueMessageFromEvent`) — no projection file |
| `readmodels[]` — multiple swimlanes, no `todoList` | `slices/<ProjectionName>/index.ts` (ProjectionConfig) |
| `processors[]` `type: "AUTOMATION"` | `endpoints/<SliceName>/pg-boss/index.ts` |
| `specifications[]` | `gwts.ts` predicates + `slices/<SliceName>/tests/command.slice.test.ts` |

### Field Type Mapping

| Event model type | TypeScript type |
|---|---|
| `UUID` | `string` |
| `String` | `string` |
| `Double` | `number` |
| `DateTime` | `Date` |

Fields marked `"generated": true` are computed in the endpoint or enrichment step (e.g.
`new Date()`, `randomUUID()`, calculated values). Never passed in by the caller.

### Dependency Arrows

| `type` | `elementType` | Meaning |
|---|---|---|
| `INBOUND` | `COMMAND` | This event is produced by that command |
| `INBOUND` | `EVENT` | This read model is built from that event |
| `INBOUND` | `READMODEL` | This automation is triggered by that read model |
| `OUTBOUND` | `EVENT` | This command can produce this event |
| `OUTBOUND` | `READMODEL` | This event updates this read model / view |
| `OUTBOUND` | `COMMAND` | This automation triggers this command |
| `OUTBOUND` | `AUTOMATION` | This read model feeds into this automation (TODO-list) |

---

## Specifications → Dedicated Slice-State View

When a slice has `specifications[]` entries with `given` events, those events define the
state the command handler needs. Maintain it in a **`SliceState<SliceName>` view**.

- **Location**: `swimlanes/<Stream>/views/SliceState<SliceName>/state.ts` + `handlers.ts`
- **Handlers**: only for event types that appear in `given` across all specifications
- **State shape**: minimum state the predicates need
- **Registered** in the stream factory with `.withView(sliceStateViewName, defaultState, handlers)`
- **Read exclusively** by this command handler via `stream.views.SliceState<SliceName>`

### Spec Mapping

- `spec.comments[0].description` → predicate name in `gwts.ts` (camelCase)
- `spec.given[]` → events that hydrate `SliceState<SliceName>`
- `spec.when[0]` → the command
- `spec.then[]` → expected emitted events (empty `then[]` = idempotent/ignore path)

The **default flow** (happy path, no pre-existing state) is also a required test case.

---

## Project Directory Structure

```
src/BusinessCapabilities/<context>/
├── endpoints/
│   ├── <SliceName>/REST/index.ts
│   ├── <SliceName>/pg-boss/index.ts
│   └── routes.ts
├── slices/
│   ├── <SliceName>/
│   │   ├── command.ts
│   │   ├── gwts.ts          ← only when specifications[] is non-empty
│   │   ├── commandHandler.ts
│   │   ├── adapter.ts
│   │   └── tests/command.slice.test.ts
│   └── <ProjectionName>/
│       ├── index.ts
│       └── projection.slice.test.ts
└── swimlanes/<StreamName>/
    ├── events/<EventName>.ts
    ├── views/
    │   ├── <StreamName>Views.ts      ← typed union of all view states (imported by messages)
    │   ├── SliceState<SliceName>/
    │   │   ├── state.ts, handlers.ts, view.slice.test.ts
    │   └── <OtherViewName>/
    │       ├── state.ts, handlers.ts, view.slice.test.ts
    ├── messages/<eventName>Messages.ts
    └── index.ts
```

---

## Key Conventions

- **External vs internal events**: events in `slice.json` carry an `elementContext` field. Only `"INTERNAL"` events are registered in the stream factory with `.withEvent()`. Events with `elementContext: "EXTERNAL"` are published to external systems (e.g. Kafka topic) and must NOT be added to the internal stream factory.
- **Events are interfaces, not classes**: define events as `export interface IEventName { ... }` (prefixed with `I`). No class, no constructor, no `payloadType` property.
- **appendEvent syntax**: use the generated method `stream.appendEvent${EventName}({ ...fields })` — pass a plain payload object, never `new EventName(...)`.
- **Event type on result**: use `result.events.map(e => e.eventType)` — the event type is a top-level field, not `e.payload.payloadType`.
- **Messages signature**: `(payload: Readonly<IEventName>, _views: <Stream>Views, metadata: IEvDbEventMetadata) => [...]`. Use `createPgBossQueueMessageFromMetadata`, `EvDbMessage.createFromMetadata`, and `createIdempotencyMessageFromMetadata` — all `*FromEvent` helpers are gone in v6.
- **Stream Views type**: each stream has a `views/<Stream>Views.ts` that is a `Readonly<Record<"ViewName", ViewState> & ...>` union of all registered views. Message handlers import this type.
- **Pure handlers**: `commandHandler.ts` never imports storage, I/O, or time. Only `stream.appendEvent*()`.
- **GWTS predicates**: only create `gwts.ts` when `specifications[]` is non-empty; each spec branch gets a named predicate matching `spec.comments[0].description`.
- **Generated fields**: computed in endpoints only — never in the pure handler. In a pg-boss automation worker, `generated: true` fields that are present in the source event payload (e.g. `reason` copied from `FundsWithdrawalDeclined`) are read from the queue payload, not regenerated. Only truly computed values (e.g. `declinedDate: new Date()`) are generated fresh.
- **Stream ID**: derived from `aggregate` in slice JSON (e.g. `command.account` for `aggregate: "funds"`).
- **Idempotency**: every pg-boss worker uses `getIdempotencyKey(transactionId, "<SliceName>")`.
- **Outbox triple**: when *creating a new messages file* for an event introduced by the current slice, include all three: pg-boss message + Kafka message + idempotency marker. When *updating an existing messages file* (the event belongs to a previously implemented slice), only add `createPgBossQueueMessageFromMetadata` — the Kafka message and idempotency marker already exist and must not be duplicated.
- **Messages import QUEUE_NAME from the endpoint**: always create the endpoint file before updating the messages file that imports its `QUEUE_NAME`. Doing it the other way round causes a TS "cannot find module" error.
- **View names**: always `const viewName = "..." as const` from `state.ts`, imported by reference.
- **Storage injection**: never singleton — always injected from `server.ts` downward.
- **`.js` extensions**: all relative imports use `.js` even for `.ts` source files.
- **Slices are immutable**: delete and recreate, never edit in place.

---

## Implementation Order per Slice

1. Update status to `"InProgress"` in `.eventmodel/.slices/index.json`
2. Read the slice JSON; classify the pattern
3. Create event interface files (see `references/templates.md` → Event)
4. If `specifications[]` has `given` events → create `SliceState<SliceName>` view
5. Create any other required views
6. Create or update `views/<Stream>Views.ts` to include all registered views for this stream
7. Create or update stream factory `index.ts`
8. Create `command.ts`, `commandHandler.ts`, `adapter.ts` (and `gwts.ts` only if `specifications[]` is non-empty)
9. Create endpoint (`REST/index.ts` or `pg-boss/index.ts`)
   - **Do this before step 10.** The endpoint file defines `QUEUE_NAME`, which messages files import.
     If you update an existing messages file before the endpoint exists, TypeScript will error on the import.
10. Create or update outbox message producers for events with downstream automation/cross-context deps
    - **New messages file** (event introduced by this slice): include all three — pg-boss message + Kafka message + idempotency marker.
    - **Updating an existing messages file** (event from a prior slice): add only `createPgBossQueueMessageFromMetadata` — the Kafka message and idempotency marker already exist.
11. Register in `server.ts` and `routes.ts`
12. Write slice-level tests only (no integration or behaviour tests):
    - `slices/<SliceName>/tests/command.slice.test.ts` — main flow + all GWT scenarios
    - `swimlanes/<Stream>/views/SliceState<SliceName>/view.slice.test.ts`
    - `swimlanes/<Stream>/views/<OtherView>/view.slice.test.ts`
    - `slices/<ProjectionName>/projection.slice.test.ts`
13. Update status to `"Review"` in `.eventmodel/.slices/index.json`

Never skip the status updates. Never start the next slice before marking the current one `"Review"`.

---

## Reference Files

Read these when you need the detailed templates — don't load them unless you're about to write the relevant code:

- **`references/templates.md`** — TypeScript file templates for all artifact types
  (Event, View state/handlers, Stream factory, Command, GWTS, CommandHandler, Adapter,
  REST endpoint, pg-boss endpoint, Projection, Messages)
- **`references/tests.md`** — Test file templates
  (Command slice tests, View slice tests, Projection slice tests)

---

## `server.ts` Registration

After implementing a slice:
1. pg-boss worker → add to `PgBossEndpointFactory.startAll(boss, [...], pool, kafka)`
2. Projection slice → add to `ProjectionFactory.startAll(kafka, pool, [...])`
3. Router → `app.use("/api/<context>", create<Context>Router(storageAdapter))`
