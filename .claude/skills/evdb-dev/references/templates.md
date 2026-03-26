# TypeScript File Templates

## Event — `swimlanes/<Stream>/events/<EventName>.ts`
```typescript
export class <EventName> {
  readonly payloadType = "<EventName>" as const;

  constructor(
    public readonly <field>: <type>,
    // all fields from events[].fields (camelCase)
  ) {}
}
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
import type { <EventName> } from "../../events/<EventName>.js";
import type { <ViewName>State } from "./state.js";

export const handlers = {
  <EventName>: (state: <ViewName>State, event: <EventName>): <ViewName>State => ({
    ...state,
    <field>: <derivedValue>,
  }),
};
```

For `SliceState<SliceName>` handlers: only include event types that appear in `spec.given[]`.

---

## Messages — `swimlanes/<Stream>/messages/<eventName>Messages.ts`

Only add a message producer for events that have an `OUTBOUND AUTOMATION` or cross-context
dependency. Events with no downstream consumers omit the second argument to `.withEventType()`.

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

---

## Stream Factory — `swimlanes/<Stream>/index.ts`
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

---

## Projection — `slices/<ProjectionName>/index.ts`
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
