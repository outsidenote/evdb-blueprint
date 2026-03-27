# TypeScript File Templates

## Event — `swimlanes/<Stream>/events/<EventName>.ts`
```typescript
export interface I<EventName> {
  readonly <field>: <type>;
  // all fields from events[].fields (camelCase)
}
```

No class, no `payloadType` property — just a plain interface prefixed with `I`.

---

## Views Type — `swimlanes/<Stream>/views/<Stream>Views.ts`

Create this file once per stream (or update it when adding new views). It is imported by message handler files.

```typescript
import type { <ViewName>State } from "./<ViewName>/state.js";
import type { SliceState<SliceName>ViewState } from "./SliceState<SliceName>/state.js";
// ... all views in this stream

export type <Stream>Views = Readonly<
  Record<"<ViewName>", <ViewName>State> &
  Record<"SliceState<SliceName>", SliceState<SliceName>ViewState>
  // one Record<> per registered view
>;
```

---

## View State — `swimlanes/<Stream>/views/<ViewName>/state.ts`
```typescript
export const viewName = "<ViewName>" as const;

export interface <ViewName>State {
  readonly <field>: <type>;
}

export const defaultState: <ViewName>State = {
  <field>: <defaultValue>,
};
```

For the dedicated slice-state view, name it `SliceState<SliceName>`:
```typescript
export const viewName = "SliceState<SliceName>" as const;

export interface SliceState<SliceName>ViewState {
  readonly <field>: <type>;  // minimum state predicates need
}

export const defaultState: SliceState<SliceName>ViewState = {
  <field>: <defaultValue>,
};
```

---

## View Handlers — `swimlanes/<Stream>/views/<ViewName>/handlers.ts`
```typescript
import type { I<EventName> } from "../../events/<EventName>.js";
import type { <ViewName>State } from "./state.js";

export const handlers = {
  <EventName>: (state: <ViewName>State, event: I<EventName>): <ViewName>State => ({
    ...state,
    <field>: <derivedValue>,
  }),
};
```

Handler signature is `(state, event: IPayload): State`. The optional third `metadata` parameter (`IEvDbEventMetadata`) is available if the handler needs event timing or correlation info.

For `SliceState<SliceName>` handlers: only include event types that appear in `spec.given[]`.

---

## Messages — `swimlanes/<Stream>/messages/<eventName>Messages.ts`

Only add a message producer for events that have an `OUTBOUND AUTOMATION` or cross-context
dependency. Events with no downstream consumers need no messages file.

Message handler signature: `(payload, views, metadata) => EvDbMessage[]`
- `payload` — the event payload interface
- `views` — the stream's typed views (use `_views` if unused)
- `metadata` — `IEvDbEventMetadata` for correlation/envelope data

**Two cases — pick the right one:**

**Case A: Creating a new messages file** (event is introduced by the current slice)
Use the full outbox triple: pg-boss queue message + Kafka message + idempotency marker.

```typescript
import type { I<EventName> } from "../events/<EventName>.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import { QUEUE_NAME as <TARGET>_QUEUE } from "../../../endpoints/<TargetSlice>/pg-boss/index.js";
import { createPgBossQueueMessageFromMetadata } from "../../../../../types/abstractions/endpoints/queueMessage.js";
import { createIdempotencyMessageFromMetadata } from "../../../../../types/abstractions/endpoints/idempotencyMessage.js";
import type { <Stream>Views } from "../views/<Stream>Views.js";

export const <eventName>Messages = (
  payload: Readonly<I<EventName>>,
  _views: <Stream>Views,
  metadata: IEvDbEventMetadata,
) => {
  const { <fields>, transactionId } = payload;
  return [
    createPgBossQueueMessageFromMetadata(
      [<TARGET>_QUEUE],
      metadata,
      "<TargetCommandType>",
      { <fields>, transactionId },
    ),
    EvDbMessage.createFromMetadata(metadata, "<EventName>", { <fields>, transactionId }),
    createIdempotencyMessageFromMetadata(metadata, transactionId, "<SliceName>"),
  ];
};
```

**Case B: Updating an existing messages file** (event belongs to a previously implemented slice)
Only add `createPgBossQueueMessageFromMetadata` to the existing return array. The Kafka message
and idempotency marker are already present — do not add them again.

```typescript
// existing imports stay; add only what's new:
import { QUEUE_NAME as <TARGET>_QUEUE } from "../../../endpoints/<TargetSlice>/pg-boss/index.js";
import { createPgBossQueueMessageFromMetadata } from "../../../../../types/abstractions/endpoints/queueMessage.js";

// inside the existing messages function, add to the return array:
createPgBossQueueMessageFromMetadata([<TARGET>_QUEUE], metadata, "<TargetCommandType>", { <fields> }),
```

---

## Stream Factory — `swimlanes/<Stream>/index.ts`
```typescript
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { I<EventName> } from "./events/<EventName>.js";
import { <eventName>Messages } from "./messages/<eventName>Messages.js";
import { defaultState as sliceStateDefaultState, viewName as sliceStateViewName } from "./views/SliceState<SliceName>/state.js";
import { handlers as sliceStateHandlers } from "./views/SliceState<SliceName>/handlers.js";
// ... other view imports

const <Stream>StreamFactory = new StreamFactoryBuilder("<StreamName>")
  .withEvent("<EventName>").asType<I<EventName>>()               // no messages
  .withEvent("<OtherEventName>").asType<I<OtherEventName>>()     // add more events
  .withMessages("<EventName>", <eventName>Messages)              // only for events that have downstream deps
  .withView(sliceStateViewName, sliceStateDefaultState, sliceStateHandlers)
  .build();

export default <Stream>StreamFactory;
export type <Stream>StreamType = typeof <Stream>StreamFactory.StreamType;
```

Register events with `.withEvent("Name").asType<IPayload>()`. Add `.withMessages("Name", fn)` separately only for events with downstream consumers. Order: all `.withEvent()` calls, then `.withMessages()`, then `.withView()`, then `.build()`.

---

## Command — `slices/<SliceName>/command.ts`
```typescript
import type { ICommand } from "../../../../types/abstractions/commands/ICommand.js";

export interface <SliceName> extends ICommand {
  readonly commandType: "<SliceName>";
  // all fields from commands[].fields (camelCase; omit "generated": true fields)
  readonly <field>: <type>;
}
```

---

## GWTS — `slices/<SliceName>/gwts.ts`
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

---

## Command Handler — `slices/<SliceName>/commandHandler.ts`
```typescript
import type { CommandHandler } from "../../../../types/abstractions/commands/commandHandler.js";
import type { <SliceName> } from "./command.js";
import type { <Stream>StreamType } from "../../swimlanes/<Stream>/index.js";
import { <predicateName> } from "./gwts.js";

/**
 * Pure command handler for the <SliceName> command.
 * ONLY appends events — no I/O, no fetching, no returning values.
 */
export const handle<SliceName>: CommandHandler<<Stream>StreamType, <SliceName>> = (stream, command) => {
  const { <field> } = stream.views.SliceState<SliceName>;

  if (<predicateName>(<field>, command)) {
    stream.appendEvent<NegativeEvent>({
      <field>: command.<field>,
      // all fields for the negative event payload
    });
  } else {
    stream.appendEvent<PositiveEvent>({
      <field>: command.<field>,
      // all fields for the positive event payload
    });
  }
  // spec with empty then[] → no appendEvent call (idempotent ignore)
};
```

`appendEvent` is a generated method per event type: `stream.appendEvent${EventName}({...})`.
Never instantiate event classes — pass plain payload objects.

---

## Adapter — `slices/<SliceName>/adapter.ts`
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
    (command: <SliceName>) => command.<streamIdField>,
    handle<SliceName>,
  );
}
```

---

## REST Endpoint — `endpoints/<SliceName>/REST/index.ts`
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
        emittedEventTypes: result.events.map(e => e.eventType),
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

---

## pg-boss Endpoint — `endpoints/<SliceName>/pg-boss/index.ts`
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
    eventType: "<TriggerEventName>",
    handlerName: "<SliceName>",
    source: "event",   // "event" for internal trigger; "message" + kafkaTopic for external Kafka
    getIdempotencyKey: (payload, _context) =>
      getIdempotencyKey(payload.transactionId, "<SliceName>"),
    handler: async (payload) => {
      const command = {
        commandType: "<SliceName>" as const,
        // map payload fields; compute "generated": true fields here
      };
      const result = await <sliceName>(command);
      console.log(`[OutboxWorker] <TriggerEventName> → <SliceName> events=[${result.events.map(e => e.eventType).join(", ")}]`);
    },
  });
}
```

`QUEUE_NAME` follows the formula `"event.<TriggerEventName>.<SliceName>"`. It is exported so messages files can import it. The `PgBossEndpointConfig` auto-derives the queue name from `source`, `eventType`, and `handlerName` — keep `QUEUE_NAME` in sync.

---

## Projection — `slices/<ProjectionName>/index.ts`
```typescript
import type { ProjectionConfig } from "../../../../types/abstractions/projections/ProjectionFactory.js";
// import ProjectionMode

export const <projectionName>Slice: ProjectionConfig = {
  projectionName: "<ProjectionName>",
  mode: { type: ProjectionModeType.Idempotent, getIdempotencyKey: (payload, meta) => `...` },
  // or { type: ProjectionModeType.Query }
  // or { type: ProjectionModeType.Transaction }
  handlers: {
    // one handler per INBOUND EVENT in readmodels[].dependencies
    <EventName>: (payload, { projectionName }) => [
      // SqlStatement[] — SQL that materialises this event into the projection table
      {
        sql: `INSERT INTO projections (name, key, payload) VALUES ($1, $2, $3::jsonb)
              ON CONFLICT (name, key) DO UPDATE SET payload = EXCLUDED.payload`,
        params: [projectionName, payload.<keyField>, JSON.stringify(payload)],
      },
    ],
  },
};
```
