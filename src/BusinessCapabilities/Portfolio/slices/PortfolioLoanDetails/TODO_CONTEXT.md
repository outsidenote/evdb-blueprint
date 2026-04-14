# TODO Context for PortfolioLoanDetails

Slice: PortfolioLoanDetails | Context: Portfolio | Stream: Portfolio
Type: **Projection / Read Model** (STATE_VIEW)

## Files with TODOs (only edit these)

- `slices/PortfolioLoanDetails/index.ts` — replace generic UPSERT with proper SQL: select specific fields, handle accumulation vs overwrite
- `slices/PortfolioLoanDetails/tests/projection.test.ts` — verify SQL params contain correct field values

## Readmodel Fields (columns of the projection)

  - `portfolioId`: string
  - `loanId`: string
  - `acquisitionDate`: Date
  - `borrowerName`: string
  - `capitalRequirement`: number
  - `creditRating`: string
  - `expectedLoss`: number
  - `interestRate`: number
  - `loanAmount`: number
  - `maturityDate`: Date
  - `probabilityOfDefault`: number
  - `riskBand`: string
  - `expectedPortfolioLoss`: number
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

  + src/BusinessCapabilities/Portfolio/slices/PortfolioLoanDetails/index.ts
  + src/BusinessCapabilities/Portfolio/slices/PortfolioLoanDetails/tests/projection.test.ts
  ~ src/BusinessCapabilities/Portfolio/slices/projections.ts
