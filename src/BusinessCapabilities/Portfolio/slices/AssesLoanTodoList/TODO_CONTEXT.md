# TODO Context for AssesLoanTodoList

Slice: AssesLoanTodoList | Context: Portfolio | Stream: Portfolio

## Files with TODOs (only edit these)

- `slices/AssesLoanTodoList/commandHandler.ts` — fill in computed event fields
- `slices/AssesLoanTodoList/mcp.ts` — replace `description: "@DESCRIPTION_TODO"` with a 1-3 sentence MCP tool description. Verb-first. For command tools, mention the event types from the `emits` array. State when an agent should call this tool. Do NOT touch any other field in the descriptor.

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

