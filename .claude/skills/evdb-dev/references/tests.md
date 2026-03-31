# Test File Templates

Only slice-level test files. No integration tests, no behaviour tests.

---

## Command Slice Tests — `slices/<SliceName>/tests/command.slice.test.ts`

One `test("main flow")` for the happy path plus one `test()` per `specifications[]` entry.
Use `example` values from the event model JSON as test data.

Events in `givenEvents` and `expectedEvents` are plain objects `{ eventType, payload }` —
no event class imports, no `new EventName(...)`.

Always import `type TestEvent` from `SliceTester` and annotate both arrays as `TestEvent[]`.
This avoids TypeScript's `TS7034`/`TS7005` implicit-`any[]` errors that arise when the array
starts empty and TypeScript cannot infer its element type.

```typescript
import { test, describe } from "node:test";
import type { <SliceName> } from "../command.js";
import { handle<SliceName> } from "../commandHandler.js";
import { SliceTester, type TestEvent } from "../../../../../types/abstractions/slices/SliceTester.js";
import <Stream>StreamFactory from "../../../swimlanes/<Stream>/index.js";

describe("<SliceName> Slice - Unit Tests", () => {
  test("main flow", async () => {
    const givenEvents: TestEvent[] = [
      // events needed to set up SliceState<SliceName> for the happy path
      // leave empty [] if the happy path requires no prior state
      { eventType: "<GivenEventName>", payload: { <field>: <value> } },
    ];
    const command: <SliceName> = {
      commandType: "<SliceName>",
      // field values from spec.when[0].fields[].example
    };
    const expectedEvents = [
      { eventType: "<PositiveEventName>", payload: { <field>: <value> } },
    ];
    return SliceTester.testCommandHandler(
      handle<SliceName>,
      <Stream>StreamFactory,
      givenEvents,
      command,
      expectedEvents,
    );
  });

  // One test() per specifications[] entry
  test("<spec.comments[0].description>", async () => {
    const givenEvents: TestEvent[] = [
      { eventType: "<GivenEventName>", payload: { <field>: <value> } },
    ];
    const command: <SliceName> = {
      commandType: "<SliceName>",
      // spec.when[0].fields[].example
    };
    const expectedEvents = [
      { eventType: "<EventName>", payload: { <field>: <value> } },
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

## View Tests — `swimlanes/<Stream>/views/<ViewName>/view.slice.test.ts`

Cover: each event that mutates the view, accumulation, no-op events, and partitioning.
For `SliceState<SliceName>`, derive scenarios from `given` events in the specifications.

Events in `given` are `{ eventType, payload }` objects — only include the fields the handler
actually uses (sparse payloads are fine for tests).

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
      { eventType: "<EventName>", payload: { <field>: <value> } },
    ],
    then: { <field>: <expectedValue> },
  },
  {
    description: "multiple events accumulate correctly",
    given: [
      { eventType: "<EventName>", payload: { <field>: <value1> } },
      { eventType: "<EventName>", payload: { <field>: <value2> } },
    ],
    then: { <field>: <combinedValue> },
  },
  {
    description: "unrelated events do not change state",
    given: [
      { eventType: "<UnrelatedEvent>", payload: {} },
    ],
    then: defaultState,
  },
  // Include meta when the handler uses event metadata:
  // { eventType: "...", payload: { ... }, meta: { capturedAt: new Date("...") } }
]);
```

---

## Projection Tests — `slices/<ProjectionName>/projection.slice.test.ts`

Cover: basic creation, accumulation, multi-entity independence, idempotency, removal.

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
]);
```
