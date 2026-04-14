# TODO Context for AddLoanToPortfolio

Slice: AddLoanToPortfolio | Context: Portfolio | Stream: Portfolio

## Files with TODOs (only edit these)

- `slices/AddLoanToPortfolio/gwts.ts` — fill in predicate conditions
- `slices/AddLoanToPortfolio/commandHandler.ts` — fill in computed event fields
- `slices/AddLoanToPortfolio/tests/command.slice.test.ts` — verify test payloads match spec examples
- `swimlanes/Portfolio/views/SliceStateAddLoanToPortfolio/view.slice.test.ts` — adjust accumulation logic in tests

## Specifications (GWT)

### spec: amountLessThanZero
Predicate: `amountLessThanZero`
**When** command: portfolioId=, acquisitionDate=, borrowerName=, creditRating=, interestRate=, loanAmount=0, loanId=, maturityDate=
**Then** emit LoanRejectedFromPortfolio: portfolioId=, acquisitionDate=, borrowerName=, creditRating=, interestRate=, loanAmount=, loanId=, maturityDate=, errorMessage=Amount should be greater than zero

### spec: portfolioRatingBreached
Predicate: `portfolioRatingBreached`
**Given** (prior events in stream):
  - LoanAddedToPortfolio: portfolioId=port-001, acquisitionDate=, borrowerName=, creditRating=, interestRate=, loanAmount=, loanId=, maturityDate=
**When** command: portfolioId=port-001, acquisitionDate=, borrowerName=, creditRating=, interestRate=, loanAmount=, loanId=, maturityDate=
**Then** emit LoanRejectedFromPortfolio: portfolioId=port-001, acquisitionDate=, borrowerName=Risky Corp, creditRating=CCC, interestRate=, loanAmount=20000000, loanId=, maturityDate=, errorMessage=

### spec: portfolioRatingMaintained
Predicate: `portfolioRatingMaintained`
**Given** (prior events in stream):
  - LoanAddedToPortfolio: portfolioId=port-001, acquisitionDate=, borrowerName=Acme Corp, creditRating=BBB, interestRate=, loanAmount=10000000, loanId=, maturityDate=
**When** command: portfolioId=port-001, acquisitionDate=, borrowerName=, creditRating=, interestRate=, loanAmount=, loanId=, maturityDate=
**Then** emit LoanAddedToPortfolio: portfolioId=port-001, acquisitionDate=, borrowerName=, creditRating=, interestRate=, loanAmount=, loanId=, maturityDate=

## Computed event fields (not on command)

These must be derived from command fields in the handler:
  - `LoanRejectedFromPortfolio.errorMessage` (String) — example value: ``

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

  + src/BusinessCapabilities/Portfolio/swimlanes/Portfolio/events/LoanRejectedFromPortfolio.ts
  + src/BusinessCapabilities/Portfolio/swimlanes/Portfolio/events/LoanAddedToPortfolio.ts
  + src/BusinessCapabilities/Portfolio/swimlanes/Portfolio/views/SliceStateAddLoanToPortfolio/state.ts
  + src/BusinessCapabilities/Portfolio/swimlanes/Portfolio/views/SliceStateAddLoanToPortfolio/handlers.ts
  + src/BusinessCapabilities/Portfolio/swimlanes/Portfolio/views/SliceStateAddLoanToPortfolio/view.slice.test.ts
  + src/BusinessCapabilities/Portfolio/slices/AddLoanToPortfolio/command.ts
  + src/BusinessCapabilities/Portfolio/slices/AddLoanToPortfolio/command.schema.ts
  + src/BusinessCapabilities/Portfolio/slices/AddLoanToPortfolio/gwts.ts
  + src/BusinessCapabilities/Portfolio/slices/AddLoanToPortfolio/commandHandler.ts
  + src/BusinessCapabilities/Portfolio/slices/AddLoanToPortfolio/adapter.ts
  + src/BusinessCapabilities/Portfolio/endpoints/AddLoanToPortfolio/REST/index.ts
  + src/BusinessCapabilities/Portfolio/endpoints/AddLoanToPortfolio/REST/behaviour.test.ts
  + src/BusinessCapabilities/Portfolio/slices/AddLoanToPortfolio/tests/command.slice.test.ts
  + src/BusinessCapabilities/Portfolio/swimlanes/Portfolio/index.ts
  + src/BusinessCapabilities/Portfolio/endpoints/routes.ts
  ~ src/BusinessCapabilities/Portfolio/swimlanes/Portfolio/index.ts
  ~ src/BusinessCapabilities/Portfolio/swimlanes/Portfolio/views/PortfolioViews.ts
