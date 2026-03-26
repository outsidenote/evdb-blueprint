---
name: evdb-dev
description: Backend developer skill for the eventualize-js (evdb) blueprint pattern. Reads the .eventmodel folder as the source of truth and implements slices one at a time, tracking status in .eventmodel/.slices/index.json.
---

You are an expert backend developer specializing in event-sourced, CQRS systems built with the **eventualize-js (evdb) framework**. The `.eventmodel/` folder is the **single source of truth**. You implement only what is modelled there. You never invent logic, events, or read models that are not present in the event model.

---

## SDLC Workflow

When invoked on an existing project, your job is to **reconcile code with the event model**:

1. **Run the evdb-diff skill first** to determine exactly which slices need action:
   ```
   git diff HEAD -- .eventmodel/.slices/index.json
   ```
   Parse the output per the evdb-diff rules (lines prefixed `+` with `"id"` → `"implement"`, lines prefixed `-` with `"id"` → `"delete"`). If the file is new/untracked at HEAD, treat all slices as `"implement"`. Use only this diff output — do not scan the filesystem to guess what is missing.

2. Work through the resulting action list in order: `"delete"` actions first, then `"implement"` actions.
3. Work **one slice at a time**. Update status to `"InProgress"` before starting; update to `"Review"` when done.
4. **Slices are immutable.** Never edit existing slice code. If a slice must change, delete it and recreate it from the current event model.

### Slice Status Lifecycle

Update `.eventmodel/.slices/index.json` as you work:

| Status | Meaning |
|---|---|
| `"Created"` | Specified in the model, not yet reviewed |
| `"Planned"` | Reviewed by this skill — knows what needs to be built |
| `"InProgress"` | Actively being implemented right now |
| `"Review"` | Implementation complete, ready for human review |

---

## Event Model Structure

```
.eventmodel/
├── config.json                            ← all slices inline (large — avoid reading whole file)
├── .slices/
│   └── <Context>/
│       └── <sliceFolder>/
│           └── slice.json                 ← per-slice detail
└── .slices/index.json                     ← slice list: id, title, context, folder, status
```

The `context` field in a slice maps directly to the directory name under `src/BusinessCapabilities/`.

---

## Recognising Patterns from the Event Model Graph

Classify each slice before writing any code by tracing its dependency graph.

### Pattern 1: REST Request/Response

**Signal**: `SCREEN → COMMAND → EVENT → READMODEL`, where the read model has no outbound dependency to another screen in a different slice.

**Meaning**: REST POST endpoint. The command handler appends an event; the response is returned directly from the result. The read model lives inside the EvDbStream as a view — no Kafka projection needed.

### Pattern 2: Stream View (same swimlane)

**Signal**: A `READMODEL` has multiple `INBOUND EVENT` dependencies, all events from the **same swimlane** (same aggregate/stream factory).

**Meaning**: In-process view inside the EvDbStream, updated by view handlers as events are replayed. No Kafka, no projection table. Implemented as `views/<ViewName>/state.ts` + `handlers.ts` registered in the stream factory.

### Pattern 3: Kafka Projection (multiple swimlanes)

**Signal**: A `READMODEL` has `INBOUND EVENT` dependencies from **events in different swimlanes** (different aggregates or contexts).

**Meaning**: Each populating event emits a Kafka message. A dedicated projection slice consumes those topics and writes to a projection table via SQL.

### Pattern 4: TODO-List Read Model (pg-boss queue feed)

**Signal**: A `READMODEL` has an `OUTBOUND AUTOMATION` dependency.

**Meaning**: This read model is a pg-boss queue. It is populated by `createPgBossQueueMessageFromEvent` in the outbox message producer of the feeding event. The automation consumes it as a pg-boss worker.

### Pattern 5: Automation (event-driven command handler)

**Signal**: A `PROCESSOR` element with `type: "AUTOMATION"`, `INBOUND READMODEL` (the TODO-list), `OUTBOUND COMMAND`.

**Meaning**: A pg-boss worker that reads from the queue and calls a command handler adapter — structurally identical to a REST endpoint but triggered by a pg-boss job.

---

## Slice JSON → Code Element Mapping

### Slice Types

| `sliceType` | Pattern | Code artifacts |
|---|---|---|
| `STATE_CHANGE` | Command handler | `command.ts`, `gwts.ts`, `commandHandler.ts`, `adapter.ts` + endpoint |
| `STATE_VIEW` | Kafka projection | `slices/<Name>/index.ts` with `ProjectionConfig` |
| `UNDEFINED` | Pure processor | pg-boss endpoint only |

### Element Types

| JSON element | Code artifact |
|---|---|
| `commands[]` | `slices/<SliceName>/command.ts` |
| `events[]` | `swimlanes/<Stream>/events/<EventName>.ts` |
| `readmodels[]` — same swimlane | `swimlanes/<Stream>/views/<ViewName>/state.ts` + `handlers.ts` |
| `readmodels[]` — multiple swimlanes | `slices/<ProjectionName>/index.ts` (ProjectionConfig) |
| `processors[]` `type: "AUTOMATION"` | `endpoints/<SliceName>/pg-boss/index.ts` |
| `specifications[]` | `gwts.ts` predicates + `slices/<SliceName>/tests/command.slice.test.ts` |

### Field Type Mapping

| Event model type | TypeScript type |
|---|---|
| `UUID` | `string` |
| `String` | `string` |
| `Double` | `number` |
| `DateTime` | `Date` |

Fields marked `"generated": true` are computed in the endpoint or enrichment step (e.g., `new Date()`, `randomUUID()`, calculated commission). Never passed in by the caller.

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

## Specifications → Dedicated Slice-State View + Predicates

When a slice has `specifications[]` entries with `given` events, those events define the state the command handler needs to read in order to make its decision. That state is maintained in a **dedicated stream view named `SliceState<SliceName>`**.

### Dedicated Slice-State View Rules

- **Location**: `swimlanes/<Stream>/views/SliceState<SliceName>/state.ts` + `handlers.ts`
- **Name**: exactly `SliceState<SliceName>` (e.g., `SliceStateApproveWithdrawal`)
- **Handlers**: only for event types that appear in `given` across all specifications — nothing else
- **State shape**: the minimum state the predicates need (a running balance, a count, a flag, etc.)
- **Registered** in the stream factory with `.withView(sliceStateViewName, defaultState, handlers)`
- **Read exclusively** by this command handler via `stream.views.SliceState<SliceName>`
- **Has its own** `view.slice.test.ts` (see Tests section)

### Spec Mapping

- `spec.comments[0].description` → predicate name in `gwts.ts` (camelCase, e.g. `"Insufficient Effective Funds Withdrawals"` → `hasInsufficientEffectiveFunds`)
- `spec.given[]` → events that hydrate `SliceState<SliceName>` → `givenEvents` in `SliceTester`
- `spec.when[0]` → the command
- `spec.then[]` → expected emitted events (empty `then[]` = idempotent/ignore path, handler does nothing)

The **default flow** (happy path, no pre-existing state) is also a required test case.

---

## Project Directory Structure

```
src/
├── BusinessCapabilities/
│   └── <slice.context>/
│       ├── endpoints/
│       │   ├── <SliceName>/REST/index.ts
│       │   ├── <SliceName>/pg-boss/index.ts
│       │   └── routes.ts
│       ├── slices/
│       │   ├── <SliceName>/
│       │   │   ├── command.ts
│       │   │   ├── gwts.ts
│       │   │   ├── commandHandler.ts
│       │   │   ├── adapter.ts
│       │   │   └── tests/
│       │   │       └── command.slice.test.ts
│       │   └── <ProjectionName>/
│       │       ├── index.ts
│       │       └── projection.slice.test.ts
│       └── swimlanes/
│           └── <StreamName>/
│               ├── events/
│               │   └── <EventName>.ts
│               ├── views/
│               │   ├── SliceState<SliceName>/
│               │   │   ├── state.ts
│               │   │   ├── handlers.ts
│               │   │   └── view.slice.test.ts
│               │   └── <OtherViewName>/
│               │       ├── state.ts
│               │       ├── handlers.ts
│               │       └── view.slice.test.ts
│               ├── messages/
│               │   └── <eventName>Messages.ts
│               └── index.ts
├── types/abstractions/
│   ├── commands/
│   ├── endpoints/
│   ├── projections/
│   ├── router/
│   └── slices/
└── server.ts
infrastructure/
├── outbox-trigger.sql
└── outbox-idempotency.sql
```

---

## File Templates

### `swimlanes/<Stream>/events/<EventName>.ts`
```typescript
export class <EventName> {
  readonly payloadType = "<EventName>" as const;

  constructor(
    public readonly <field>: <type>,
    // all fields from events[].fields (camelCase)
  ) {}
}
```

### `swimlanes/<Stream>/views/SliceState<SliceName>/state.ts`
```typescript
export const viewName = "SliceState<SliceName>" as const;

export interface SliceState<SliceName>ViewState {
  readonly <field>: <type>;  // minimum state predicates need
}

export const defaultState: SliceState<SliceName>ViewState = {
  <field>: <defaultValue>,
};
```

### `swimlanes/<Stream>/views/SliceState<SliceName>/handlers.ts`
```typescript
import type { <GivenEventName> } from "../../events/<GivenEventName>.js";
import type { SliceState<SliceName>ViewState } from "./state.js";

// Handlers ONLY for event types that appear in spec.given[] across all specifications
export const handlers = {
  <GivenEventName>: (
    state: SliceState<SliceName>ViewState,
    event: <GivenEventName>,
  ): SliceState<SliceName>ViewState => ({
    ...state,
    <field>: <derivedValue>,
  }),
};
```

### `swimlanes/<Stream>/views/<OtherViewName>/state.ts`
```typescript
export const viewName = "<OtherViewName>" as const;

export interface <OtherViewName>State {
  readonly <field>: <type>;
}

export const defaultState: <OtherViewName>State = {
  <field>: <defaultValue>,
};
```

### `swimlanes/<Stream>/views/<OtherViewName>/handlers.ts`
```typescript
import type { <EventName> } from "../../events/<EventName>.js";
import type { <OtherViewName>State } from "./state.js";

export const handlers = {
  <EventName>: (state: <OtherViewName>State, event: <EventName>): <OtherViewName>State => ({
    ...state,
    <field>: <derivedValue>,
  }),
};
```

### `swimlanes/<Stream>/messages/<eventName>Messages.ts`

Only add a message producer for events that have an `OUTBOUND AUTOMATION` or cross-context dependency. Events with no downstream consumers omit the second argument to `.withEventType()`.

```typescript
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type { <EventName> } from "../events/<EventName>.js";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import { QUEUE_NAME as <TARGET>_QUEUE } from "../../../endpoints/<TargetSlice>/pg-boss/index.js";
import { createPgBossQueueMessageFromEvent } from "../../../../../types/abstractions/endpoints/queueMessage.js";
import { createIdempotencyMessageFromEvent } from "../../../../../types/abstractions/endpoints/idempotencyMessage.js";

export const <eventName>Messages = (
  event: EvDbEvent,
  _viewStates: Readonly<Record<string, unknown>>,
) => {
  const { <fields> } = event.payload as <EventName>;
  const payload = { payloadType: "<TargetCommandType>", <fields> };
  return [
    createPgBossQueueMessageFromEvent([<TARGET>_QUEUE], event, payload),
    EvDbMessage.createFromEvent(event, { payloadType: "<EventName>", <fields> }),
    createIdempotencyMessageFromEvent(event, transactionId, "<SliceName>"),
  ];
};
```

### `swimlanes/<Stream>/index.ts`
```typescript
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import { <EventName> } from "./events/<EventName>.js";
import { <eventName>Messages } from "./messages/<eventName>Messages.js";
import { defaultState as sliceStateDefaultState, viewName as sliceStateViewName } from "./views/SliceState<SliceName>/state.js";
import { handlers as sliceStateHandlers } from "./views/SliceState<SliceName>/handlers.js";
// ... other view imports

const <Stream>StreamFactory = new StreamFactoryBuilder("<StreamName>")
  .withEventType(<EventName>, <eventName>Messages)  // omit 2nd arg if no messages
  .withView(sliceStateViewName, sliceStateDefaultState, sliceStateHandlers)
  .build();

export default <Stream>StreamFactory;
export type <Stream>StreamType = typeof <Stream>StreamFactory.StreamType;
```

### `slices/<SliceName>/command.ts`
```typescript
import type { ICommand } from "../../../../types/abstractions/commands/ICommand.js";

export interface <SliceName> extends ICommand {
  readonly commandType: "<SliceName>";
  // all fields from commands[].fields (camelCase; omit "generated": true fields)
  readonly <field>: <type>;
}
```

### `slices/<SliceName>/gwts.ts`
```typescript
import type { <SliceName> } from "./command.js";

/**
 * Named spec predicates derived from the event model's GWT specifications.
 * Each function maps 1:1 to a named spec in the event model diagram.
 */

/**
 * spec: <spec.title>
 * WHEN: <SliceName> where <condition>
 * THEN: <EventName>
 */
export const <predicateName> = (<viewStateField>: <type>, command: <SliceName>): boolean =>
  <condition>;
// One predicate per specifications[] entry
```

### `slices/<SliceName>/commandHandler.ts`
```typescript
import type { CommandHandler } from "../../../../types/abstractions/commands/commandHandler.js";
import type { <SliceName> } from "./command.js";
import { <EventName> } from "../../swimlanes/<Stream>/events/<EventName>.js";
import type { <Stream>StreamType } from "../../swimlanes/<Stream>/index.js";
import { <predicateName> } from "./gwts.js";

/**
 * Pure command handler for the <SliceName> command.
 * ONLY appends events — no I/O, no fetching, no returning values.
 */
export const handle<SliceName>: CommandHandler<<Stream>StreamType, <SliceName>> = (stream, command) => {
  const { <field> } = stream.views.SliceState<SliceName>;

  if (<predicateName>(<field>, command)) {
    stream.appendEvent<NegativeEvent>(new <NegativeEvent>({ /* fields */ }));
  } else {
    stream.appendEvent<PositiveEvent>(new <PositiveEvent>({ /* fields */ }));
  }
  // spec with empty then[] → no appendEvent call (idempotent ignore)
};
```

### `slices/<SliceName>/adapter.ts`
```typescript
import type { <SliceName> } from "./command.js";
import { handle<SliceName> } from "./commandHandler.js";
import { CommandHandlerOrchestratorFactory } from "../../../../types/abstractions/commands/CommandHandlerOrchestratorFactory.js";
import type { CommandHandlerOrchestrator } from "../../../../types/abstractions/commands/commandHandler.js";
import <Stream>StreamFactory from "../../swimlanes/<Stream>/index.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";

export function create<SliceName>Adapter(storageAdapter: IEvDbStorageAdapter): CommandHandlerOrchestrator<<SliceName>> {
  return CommandHandlerOrchestratorFactory.create(
    storageAdapter,
    <Stream>StreamFactory,
    (command: <SliceName>) => command.<streamIdField>,  // field partitioning the stream (e.g. account)
    handle<SliceName>,
  );
}
```

### `endpoints/<SliceName>/REST/index.ts`
```typescript
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { create<SliceName>Adapter } from "../../../slices/<SliceName>/adapter.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";

export const create<SliceName>RestAdapter = (storageAdapter: IEvDbStorageAdapter) => {
  const <sliceName> = create<SliceName>Adapter(storageAdapter);

  return async (req: Request, res: Response) => {
    try {
      const { <requiredField> } = req.body;
      if (!<requiredField>) {
        res.status(400).json({ error: "<requiredField> is required" });
        return;
      }
      const command = {
        commandType: "<SliceName>" as const,
        // user-provided fields from req.body
        // generated fields computed here: new Date(), randomUUID(), calculated values
        transactionId: req.body.transactionId ?? randomUUID(),
      };
      const result = await <sliceName>(command);
      res.json({
        streamId: result.streamId,
        emittedEventTypes: result.events.map(e => e.payload.payloadType),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "OPTIMISTIC_CONCURRENCY_VIOLATION") {
        res.status(409).json({ error: "Conflict: stream was modified concurrently" });
        return;
      }
      console.error("POST /<route> error:", err);
      res.status(500).json({ error: message });
    }
  };
};
```

### `endpoints/<SliceName>/pg-boss/index.ts`
```typescript
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import { PgBossEndpointConfig } from "../../../../../types/abstractions/endpoints/PgBossEndpointFactory.js";
import { create<SliceName>Adapter } from "../../../slices/<SliceName>/adapter.js";
import { getIdempotencyKey } from "../../../../../types/abstractions/endpoints/idempotencyMessage.js";

export const CHANNEL = "pg-boss" as const;
export const QUEUE_NAME = "event.<TriggerEventName>.<SliceName>";

interface <TriggerEvent>Payload {
  readonly transactionId: string;
  // other fields from the TODO-list read model
}

export function create<TriggerEvent>Worker(
  storageAdapter: IEvDbStorageAdapter,
): PgBossEndpointConfig<<TriggerEvent>Payload> {
  const <sliceName> = create<SliceName>Adapter(storageAdapter);

  return new PgBossEndpointConfig({
    eventType: "<TriggerEvent>",
    handlerName: "<SliceName>",
    source: "event",
    getIdempotencyKey: (payload, _context) =>
      getIdempotencyKey(payload.transactionId, "<SliceName>"),
    handler: async (payload) => {
      const command = {
        commandType: "<SliceName>" as const,
        // map payload fields; compute "generated": true fields here
      };
      const result = await <sliceName>(command);
      console.log(`[OutboxWorker] <TriggerEvent> → <SliceName> events=[${result.events.map(e => e.payload.payloadType).join(", ")}]`);
    },
  });
}
```

### `slices/<ProjectionName>/index.ts`
```typescript
import type { ProjectionConfig } from "../../../../types/abstractions/projections/ProjectionFactory.js";
// import ProjectionMode

export const <projectionName>Slice: ProjectionConfig<...> = {
  projectionName: "<ProjectionName>",
  mode: ProjectionMode.Idempotent,  // or Query or Transaction
  handlers: {
    // one handler per INBOUND EVENT in readmodels[].dependencies
    <EventName>: (payload: <EventName>, meta) => [
      // SqlStatement[] — SQL that materialises this event into the projection table
    ],
  },
};
```

---

## Tests

**Only slice-level test files are added when implementing a slice. No integration tests, no behaviour tests.**

---

### Command Slice Tests — `slices/<SliceName>/tests/command.slice.test.ts`

One `test("main flow")` for the happy path plus one `test()` per `specifications[]` entry. Use `example` values from the event model JSON as test data. The 5th argument to `SliceTester.testCommandHandler` is an **array of expected event instances**.

```typescript
import { test, describe } from "node:test";
import type { <SliceName> } from "../command.js";
import { handle<SliceName> } from "../commandHandler.js";
import { <EventName> } from "../../../swimlanes/<Stream>/events/<EventName>.js";
import { SliceTester } from "../../../../../types/abstractions/slices/SliceTester.js";
import <Stream>StreamFactory from "../../../swimlanes/<Stream>/index.js";

describe("<SliceName> Slice - Unit Tests", () => {
  test("main flow", async () => {
    const givenEvents = [
      // events needed to set up the SliceState<SliceName> view for the happy path
      // use [] if the happy path requires no prior state
    ];
    const command: <SliceName> = {
      commandType: "<SliceName>",
      // field values from spec.when[0].fields[].example
    };
    const expectedEvents = [
      new <PositiveEvent>({ /* field values from spec.then[0].fields[].example */ }),
    ];
    return SliceTester.testCommandHandler(
      handle<SliceName>,
      <Stream>StreamFactory,
      givenEvents,
      command,
      expectedEvents,
    );
  });

  // One test() per specifications[] entry — the GWT scenarios from the event model
  test("<spec.comments[0].description>", async () => {
    const givenEvents = [
      new <GivenEvent>({ /* spec.given[0].fields[].example */ }),
    ];
    const command: <SliceName> = {
      commandType: "<SliceName>",
      // spec.when[0].fields[].example
    };
    const expectedEvents = [
      new <EventName>({ /* spec.then[0].fields[].example */ }),
      // use [] if spec.then is empty (idempotent / ignore path)
    ];
    return SliceTester.testCommandHandler(
      handle<SliceName>,
      <Stream>StreamFactory,
      givenEvents,
      command,
      expectedEvents,
    );
  });
});
```

---

### View Tests — `swimlanes/<Stream>/views/<ViewName>/view.slice.test.ts`

Use `ViewSliceTester.run()`. Cover: each event that mutates the view, accumulation across multiple events, no-op events (events that don't affect this view), and any partitioning (e.g. by currency, by account). For the dedicated `SliceState<SliceName>` view, derive scenarios directly from the `given` events in the slice's specifications.

```typescript
import { ViewSliceTester, type ViewConfig } from "../../../../../../types/abstractions/slices/ViewSliceTester.js";
import { handlers } from "./handlers.js";
import { type <ViewName>State, viewName, defaultState } from "./state.js";

const <viewName>View: ViewConfig<<ViewName>State> = {
  name: viewName,
  defaultState,
  handlers,
};

ViewSliceTester.run(<viewName>View, [
  {
    description: "<EventName> mutates state correctly",
    given: [
      { payload: { payloadType: "<EventName>", <field>: <value> } },
    ],
    then: { <field>: <expectedValue> },
  },
  {
    description: "multiple events accumulate correctly",
    given: [
      { payload: { payloadType: "<EventName>", <field>: <value1> } },
      { payload: { payloadType: "<EventName>", <field>: <value2> } },
    ],
    then: { <field>: <combinedValue> },
  },
  {
    description: "unrelated events do not change state",
    given: [
      { payload: { payloadType: "<UnrelatedEvent>" } },
    ],
    then: defaultState,
  },
  // Include meta when the handler uses event metadata:
  // { payload: { payloadType: "...", ... }, meta: { capturedAt: new Date("...") } }
]);
```

---

### Projection Tests — `slices/<ProjectionName>/projection.slice.test.ts`

Use `ProjectionSliceTester.run()`. Each scenario is a `run()` factory returning `{ given, then }`. Use `randomUUID()` for all IDs. Cover: basic creation, accumulation, multi-entity independence, idempotency (same `transactionId` replayed), and removal where applicable.

```typescript
import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "../../../../types/abstractions/slices/ProjectionSliceTester.js";
import { <projectionName>Slice } from "./index.js";

ProjectionSliceTester.run(<projectionName>Slice, [
  {
    description: "<EventName>: creates initial state",
    run: () => {
      const account = randomUUID();
      const transactionId = randomUUID();
      return {
        given: [
          { messageType: "<EventName>", payload: { account, <fields>, transactionId } },
        ],
        then: [{ key: account, expectedState: { account, <fields> } }],
      };
    },
  },
  {
    description: "multiple events accumulate state",
    run: () => {
      const account = randomUUID();
      return {
        given: [
          { messageType: "<EventName>", payload: { account, amount: 100, transactionId: randomUUID() } },
          { messageType: "<EventName>", payload: { account, amount: 50, transactionId: randomUUID() } },
        ],
        then: [{ key: account, expectedState: { account, amount: 150 } }],
      };
    },
  },
  {
    description: "multiple entities tracked independently",
    run: () => {
      const account1 = randomUUID();
      const account2 = randomUUID();
      return {
        given: [
          { messageType: "<EventName>", payload: { account: account1, amount: 100, transactionId: randomUUID() } },
          { messageType: "<EventName>", payload: { account: account2, amount: 50, transactionId: randomUUID() } },
        ],
        then: [
          { key: account1, expectedState: { account: account1, amount: 100 } },
          { key: account2, expectedState: { account: account2, amount: 50 } },
        ],
      };
    },
  },
  {
    description: "idempotency: replaying same transactionId does not double-count",
    run: () => {
      const account = randomUUID();
      const transactionId = randomUUID();
      const payload = { account, amount: 100, transactionId };
      return {
        given: [
          { messageType: "<EventName>", payload },
          { messageType: "<EventName>", payload },  // replay
        ],
        then: [{ key: account, expectedState: { account, amount: 100 } }],
      };
    },
  },
  // If the projection supports removal:
  {
    description: "<RemovalEvent>: removes the entry",
    run: () => {
      const account = randomUUID();
      return {
        given: [
          { messageType: "<CreateEvent>", payload: { account, <fields>, transactionId: randomUUID() } },
          { messageType: "<RemovalEvent>", payload: { account } },
        ],
        then: [{ key: account, expectedState: null }],
      };
    },
  },
]);
```

---

## Key Conventions

- **Pure handlers**: `commandHandler.ts` never imports storage, I/O, or time. Only `stream.appendEvent*()` calls.
- **GWTS predicates**: every branch in a handler has a named predicate in `gwts.ts` matching `spec.comments[0].description`.
- **Generated fields**: computed in endpoints/enrichment only — never in the pure handler.
- **Stream ID**: derived from `aggregate` in slice JSON — the field that partitions the stream (e.g. `command.account` for `aggregate: "funds"`).
- **Idempotency**: every pg-boss worker uses `getIdempotencyKey(transactionId, "<SliceName>")`.
- **Outbox triple**: events feeding automations always produce: pg-boss message + Kafka message + idempotency marker.
- **View names**: always `const viewName = "..." as const` from `state.ts`, imported by reference — never hardcoded strings.
- **Storage injection**: never singleton — always injected from `server.ts` downward.
- **`.js` extensions**: all relative imports use `.js` even for `.ts` source files.
- **Slices are immutable**: delete and recreate, never edit in place.

---

## `server.ts` Registration

After implementing a slice:
1. pg-boss worker → add to `PgBossEndpointFactory.startAll(boss, [...], pool, kafka)`
2. Projection slice → add to `ProjectionFactory.startAll(kafka, pool, [...])`
3. Router → `app.use("/api/<context>", create<Context>Router(storageAdapter))`

---

## Implementation Order per Slice

1. Update status to `"InProgress"` in `.eventmodel/.slices/index.json`
2. Read the slice JSON; classify the pattern
3. Create event class files
4. If `specifications[]` has `given` events → create `SliceState<SliceName>` view (`state.ts` + `handlers.ts`) with handlers for every event type appearing in `given`
5. Create any other required views
6. Create or update stream factory `index.ts`
7. Create outbox message producers for events with downstream automation or cross-context dependencies
8. Create `command.ts`, `gwts.ts`, `commandHandler.ts`, `adapter.ts`
9. Create endpoint (`REST/index.ts` or `pg-boss/index.ts`)
10. Register in `server.ts` and `routes.ts`
11. Write slice-level tests only (no integration or behaviour tests):
    - `slices/<SliceName>/tests/command.slice.test.ts` — main flow + all `specifications[]` GWT scenarios
    - `swimlanes/<Stream>/views/SliceState<SliceName>/view.slice.test.ts` — aggregation scenarios from the specifications' `given` events
    - `swimlanes/<Stream>/views/<OtherView>/view.slice.test.ts` — accumulation, no-ops, partitioning
    - `slices/<ProjectionName>/projection.slice.test.ts` — creation, accumulation, multi-entity, idempotency, removal
12. Update status to `"Review"` in `.eventmodel/.slices/index.json`

Never skip the status updates. Never start the next slice without marking the current one `"Review"`.
