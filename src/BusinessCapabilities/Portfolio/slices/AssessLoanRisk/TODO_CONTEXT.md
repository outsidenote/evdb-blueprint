# TODO Context for AssessLoanRisk

Slice: AssessLoanRisk | Context: Portfolio | Stream: Portfolio
Trigger: **Loans Pending Risk Assess** readmodel via outbox (source: `event`)

## Files with TODOs (only edit these)

- `slices/AssessLoanRisk/commandHandler.ts` — fill in computed event fields
- `endpoints/AssessLoanRisk/enrichment.ts` — implement enrichment logic per description below
- `endpoints/AssessLoanRisk/tests/enrichment.test.ts` — verify enrichment output
- `endpoints/AssessLoanRisk/tests/automation.endpoint.test.ts` — verify endpoint identity and mapping

## Backend Prompts (implementation instructions from the event modeler)

Risk assessment engine for CLO portfolio loans.

Step 1: Map credit rating to probability of default (PD): AAA→0.01%, AA→0.02%, A→0.05%, BBB→0.20%, BB→1.00%, B→3.00%, CCC→10.00%.

Step 2: Calculate risk weight using Basel III standardized approach: AAA→0.20, AA→0.25, A→0.35, BBB→0.50, BB→0.75, B→1.00, CCC→1.50. Adjust for maturity: if maturity > 5 years, multiply risk weight by 1.15.

Step 3: Calculate capitalRequirement = loanAmount × adjustedRiskWeight × 0.08.

Step 4: Calculate expectedLoss = loanAmount × probabilityOfDefault × 0.45 (LGD assumption 45%).

Step 5: Derive riskBand from adjusted risk weight: ≤ 0.30 → "Investment Grade - Low", ≤ 0.55 → "Investment Grade - Medium", ≤ 1.00 → "Speculative - High", > 1.00 → "Speculative - Critical".

Step 6: Run Monte Carlo simulation (1000 iterations) for loan default probability:

For each iteration, generate a random number between 0 and 1
If random < probabilityOfDefault, the loan defaults in this scenario
If defaulted, apply recovery rate: loss = loanAmount × (1 - recoveryRate). Recovery rate by rating: AAA-A→0.70, BBB→0.55, BB→0.40, B→0.30, CCC→0.20
Track: number of defaults, total simulated losses
Step 7: Compute simulation results:

simulatedDefaultRate = defaults / 1000 (should approximate the PD)
expectedPortfolioLoss = average loss across all iterations
worstCaseLoss = 95th percentile loss (VaR at 95% confidence)
tailRiskLoss = average of worst 5% scenarios (CVaR / Expected Shortfall)
Step 8: Build riskNarrative: "{creditRating} loan (${loanAmount}): {riskBand}. Simulated default rate: {simulatedDefaultRate}%. Expected loss: ${expectedPortfolioLoss}. VaR(95%): ${worstCaseLoss}. Tail risk: ${tailRiskLoss}

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

  + src/BusinessCapabilities/Portfolio/swimlanes/Portfolio/events/LoanRiskAssessed.ts
  + src/BusinessCapabilities/Portfolio/slices/AssessLoanRisk/command.ts
  + src/BusinessCapabilities/Portfolio/slices/AssessLoanRisk/commandHandler.ts
  + src/BusinessCapabilities/Portfolio/slices/AssessLoanRisk/adapter.ts
  + src/BusinessCapabilities/Portfolio/endpoints/AssessLoanRisk/pg-boss/index.ts
  + src/BusinessCapabilities/Portfolio/endpoints/AssessLoanRisk/enrichment.ts
  + src/BusinessCapabilities/Portfolio/endpoints/AssessLoanRisk/tests/enrichment.test.ts
  + src/BusinessCapabilities/Portfolio/swimlanes/Portfolio/messages/LoanAddedToPortfolioMessages.ts
  + src/BusinessCapabilities/Portfolio/endpoints/AssessLoanRisk/tests/automation.endpoint.test.ts
  + src/BusinessCapabilities/Portfolio/slices/AssessLoanRisk/tests/command.slice.test.ts
  + src/BusinessCapabilities/Portfolio/endpoints/automations.ts
  ~ src/BusinessCapabilities/Portfolio/swimlanes/Portfolio/index.ts
  ~ src/BusinessCapabilities/Portfolio/swimlanes/Portfolio/index.ts
