# TODO Context for CreateAccount

Slice: CreateAccount | Context: Account | Stream: Account

## Files with TODOs (only edit these)

- `slices/CreateAccount/commandHandler.ts` — fill in computed event fields

## API Patterns (exact syntax — do NOT deviate)

### Command handler — append events
```typescript
// CORRECT: stream.appendEvent{EventName}({ plain payload })
stream.appendEventFundsWithdrawalApproved({
  account: command.account,
  amount: command.amount,
});
// WRONG: stream.addEvent(), stream.emit(), eventType in payload
```

### Event interface — plain, no inheritance
```typescript
// CORRECT: plain interface, I-prefix, no eventType field
export interface IFundsWithdrawalApproved {
  readonly account: string;
  readonly amount: number;
}
// WRONG: extends IEvDbEvent, eventType field
```

### Stream factory — register events
```typescript
// CORRECT: .withEvent("Name").asType<IType>()
new StreamFactoryBuilder("FundsStream")
  .withEvent("FundsWithdrawalApproved").asType<IFundsWithdrawalApproved>()
  .build();
// WRONG: .addEventType<T>(), .registerEvent()
```

### Test events — envelope format
```typescript
// CORRECT: { eventType, payload: { ...fields } }
const expectedEvents: TestEvent[] = [
  {
    eventType: "FundsWithdrawalApproved",
    payload: {
      account: "1234",
      amount: 20,
    },
  },
];
// WRONG: flat { eventType, account, amount }
```

### View test format (ViewSliceTester)
```typescript
ViewSliceTester.run(viewConfig, [
  {
    description: "event updates state correctly",
    given: [
      { eventType: "EventName", payload: { field: value } },
    ],
    then: { field: expectedValue }, // expected state after folding
  },
]);
// 'given' = events to fold, 'then' = expected view state after folding
// For accumulation: two given events, 'then' has accumulated value
// For overwrite: 'then' matches last event's value
```

### Other patterns
- `commandHandler.ts`: pure function, only `stream.appendEvent*()` calls, no I/O
- `gwts.ts`: `(state, command) => boolean` — compare state fields vs command fields
- View handlers: `(state, event) => ({ ...state, field: event.field })`
- All event payloads in tests must include ALL fields from the event interface

## All scaffold output

  + src/BusinessCapabilities/Account/swimlanes/Account/events/Accountcreated.ts
  + src/BusinessCapabilities/Account/slices/CreateAccount/command.ts
  + src/BusinessCapabilities/Account/slices/CreateAccount/command.schema.ts
  + src/BusinessCapabilities/Account/slices/CreateAccount/commandHandler.ts
  + src/BusinessCapabilities/Account/slices/CreateAccount/adapter.ts
  + src/BusinessCapabilities/Account/endpoints/CreateAccount/REST/index.ts
  + src/BusinessCapabilities/Account/endpoints/CreateAccount/REST/behaviour.test.ts
  + src/BusinessCapabilities/Account/slices/CreateAccount/tests/command.slice.test.ts
  + src/BusinessCapabilities/Account/swimlanes/Account/index.ts
  + src/BusinessCapabilities/Account/endpoints/routes.ts
  ~ src/BusinessCapabilities/Account/swimlanes/Account/index.ts
