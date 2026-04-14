# TODO Context for PortfolioSummary

Slice: PortfolioSummary | Context: Portfolio | Stream: Portfolio
Type: **Projection / Read Model** (STATE_VIEW)

## Files with TODOs (only edit these)

- `slices/PortfolioSummary/index.ts` — replace generic UPSERT with proper SQL: select specific fields, handle accumulation vs overwrite
- `slices/PortfolioSummary/tests/projection.test.ts` — verify SQL params contain correct field values

## Readmodel Description (from the event modeler)

Aggregates per portfolio. Each LoanRiskAssessed increments totalLoans by 1, adds loanAmount to totalExposure, adds capitalRequirement to totalCapitalRequirement, adds expectedLoss to totalExpectedLoss. averageRiskWeight = weighted average of riskWeight by loanAmount. averageProbabilityOfDefault = weighted average of probabilityOfDefault by loanAmount. averageRating derived from averageRiskWeight: ≤0.25→AA, ≤0.35→A, ≤0.50→BBB, ≤0.75→BB, >0.75→B. riskBand: averageRiskWeight ≤0.55→"Investment Grade", >"Speculative". Track worstRating: the lowest credit rating in the portfolio (highest risk weight). Compare each incoming riskWeight — if higher than stored worst, update worstRating.


## Readmodel Fields (columns of the projection)

  - `portfolioId`: string (example: `PORT-01`)
  - `averageProbabilityOfDefault`: number (example: `5`)
  - `averageRating`: string (example: `A`)
  - `averageRiskWeight`: number (example: `10`)
  - `riskBand`: string (example: `A`)
  - `totalCapitalRequirement`: number (example: `1000`)
  - `totalExpectedLoss`: number (example: `12`)
  - `totalExposure`: number (example: `10000`)
  - `totalLoans`: number (example: `2`)
  - `worstRating`: string (example: `CC`)
  - `acquisitionDate`: Date
  - `borrowerName`: string
  - `capitalRequirement`: number
  - `creditRating`: string
  - `expectedLoss`: number
  - `expectedPortfolioLoss`: number
  - `interestRate`: number
  - `loanAmount`: number
  - `loanId`: string
  - `maturityDate`: Date
  - `probabilityOfDefault`: number
  - `riskNarrative`: string
  - `simulatedDefaultRate`: number
  - `tailRiskLoss`: number
  - `worstCaseLoss`: number

**Key**: `portfolioId`

## Inbound Events (triggers this projection)

  - `LoanRiskAssessed`

## Patterns (projection SQL)

```typescript
// UPSERT with accumulation — increment numeric fields
handlers: {
  EventName: (payload, { projectionName }) => {
    const p = payload as PayloadType;
    const key = `${p.currency}:${p.reportDate}`;  // composite key
    return [{
      sql: `
        INSERT INTO projections (name, key, payload)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (name, key) DO UPDATE
          SET payload = jsonb_set(
            jsonb_set(projections.payload, '{totalAmount}',
              to_jsonb((projections.payload->>'totalAmount')::numeric + $4)),
            '{count}',
            to_jsonb((projections.payload->>'count')::int + 1)
          )`,
      params: [projectionName, key, JSON.stringify(p), p.amount],
    }];
  },
}
```

### Key rules
- Use `projectionName` param (from meta), never hardcode the projection name
- Destructure payload fields explicitly — don't `JSON.stringify(p)` the whole payload for the initial INSERT
- For accumulation fields (totals, counts): use `jsonb_set` + cast in the ON CONFLICT clause
- For overwrite fields (status, name): use `EXCLUDED.payload` or explicit SET
- Composite keys: build as template literal from payload fields

## All scaffold output

  + src/BusinessCapabilities/Portfolio/slices/PortfolioSummary/index.ts
  + src/BusinessCapabilities/Portfolio/slices/PortfolioSummary/tests/projection.test.ts
  + src/BusinessCapabilities/Portfolio/slices/projections.ts
  + src/BusinessCapabilities/Portfolio/swimlanes/Portfolio/messages/LoanRiskAssessedMessages.ts
  ~ src/BusinessCapabilities/Portfolio/swimlanes/Portfolio/index.ts
