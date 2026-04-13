# TODO Context for ReportTransactionInBaseCurrency

Slice: ReportTransactionInBaseCurrency | Context: Reporting | Stream: Reporting
Trigger: **Funds Withdrawn** event via Kafka CDC (source: `message`)
Kafka topic: `events.FundsWithdrawn`

## Files with TODOs (only edit these)

- `slices/ReportTransactionInBaseCurrency/commandHandler.ts` — fill in computed event fields
- `endpoints/ReportTransactionInBaseCurrency/enrichment.ts` — implement enrichment logic per description below
- `endpoints/ReportTransactionInBaseCurrency/tests/enrichment.test.ts` — verify enrichment output
- `endpoints/ReportTransactionInBaseCurrency/tests/automation.endpoint.test.ts` — verify endpoint identity and mapping

## Backend Prompts (implementation instructions from the event modeler)

Enrichment: Exchange Rate Calculator

Fetch the current exchange rate between the incoming transaction currency and the base reporting currency (default: EUR) using the Frankfurter API.

API: GET https://api.frankfurter.app/latest?from={currency}&to=EUR

Example request: GET https://api.frankfurter.app/latest?from=USD&to=EUR

Example response:


{ "base": "USD", "date": "2026-04-02", "rates": { "EUR": 0.92 } }
Steps:

If currency equals EUR, set exchangeRate = 1, baseCurrencyAmount = amount, skip to step 4
Call https://api.frankfurter.app/latest?from={currency}&to=EUR
Extract rate, calculate baseCurrencyAmount = amount * rate, round to 2 decimal places
Return: exchangeRate, baseCurrencyAmount, baseCurrency = "EUR"

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

  + src/BusinessCapabilities/Reporting/swimlanes/Reporting/events/TxnReportedInBaseCurrency.ts
  + src/BusinessCapabilities/Reporting/slices/ReportTransactionInBaseCurrency/command.ts
  + src/BusinessCapabilities/Reporting/slices/ReportTransactionInBaseCurrency/commandHandler.ts
  + src/BusinessCapabilities/Reporting/slices/ReportTransactionInBaseCurrency/adapter.ts
  + src/BusinessCapabilities/Reporting/endpoints/ReportTransactionInBaseCurrency/pg-boss/index.ts
  + src/BusinessCapabilities/Reporting/endpoints/ReportTransactionInBaseCurrency/enrichment.ts
  + src/BusinessCapabilities/Reporting/endpoints/ReportTransactionInBaseCurrency/tests/enrichment.test.ts
  + src/BusinessCapabilities/Reporting/swimlanes/Reporting/messages/FundsWithdrawnMessages.ts
  + src/BusinessCapabilities/Reporting/endpoints/ReportTransactionInBaseCurrency/tests/automation.endpoint.test.ts
  + src/BusinessCapabilities/Reporting/slices/ReportTransactionInBaseCurrency/tests/command.slice.test.ts
  + src/BusinessCapabilities/Reporting/swimlanes/Reporting/index.ts
  + src/BusinessCapabilities/Reporting/endpoints/automations.ts
  ~ src/BusinessCapabilities/Reporting/swimlanes/Reporting/index.ts
