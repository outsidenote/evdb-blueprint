# TODO Context for PortfolioLoanDetails

Slice: PortfolioLoanDetails | Context: Portfolio | Stream: Portfolio
Type: **Projection / Read Model** (STATE_VIEW)

## Files with TODOs (only edit these)

- `slices/PortfolioLoanDetails/index.ts` — replace generic UPSERT with proper SQL: select specific fields, handle accumulation vs overwrite
- `slices/PortfolioLoanDetails/tests/projection.test.ts` — verify SQL params contain correct field values
- `slices/PortfolioLoanDetails/projection.slice.test.ts` — fill event payloads and expected state (runs against real PostgreSQL via testcontainers)
- `slices/PortfolioLoanDetails/mcp.ts` — replace `description: "@DESCRIPTION_TODO"` with a 1-3 sentence MCP tool description. Verb-first. For command tools, mention the event types from the `emits` array. State when an agent should call this tool. Do NOT touch any other field in the descriptor.

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

Pre-built example using THIS slice's actual fields. The casts below are correct;
you only need to fill in the accumulation formulas (sum, average, weighted, etc.).

```typescript
// UPSERT with accumulation using jsonb_build_object
// CRITICAL RULES:
//   1. $1 = projectionName, $2 = key — NEVER cast these (varchar columns)
//   2. NEVER reuse $1 or $2 inside jsonb_build_object — pass payload fields as $3+
//   3. Every $N inside jsonb_build_object MUST have a cast (Postgres cannot infer in jsonb)
//   4. Use the EXACT casts shown below — they match the field types in this slice
handlers: {
  EventName: (payload, { projectionName }) => {
    const p = payload as PayloadType;
    const key = p.portfolioId;
    return [{
      sql: `
        INSERT INTO projections (name, key, payload)
        VALUES ($1, $2, jsonb_build_object(
          'acquisitionDate', $3::timestamptz,
          'borrowerName', $4::text,
          'capitalRequirement', $5::numeric,
          'creditRating', $6::text,
          'expectedLoss', $7::numeric,
          'interestRate', $8::numeric,
          'loanAmount', $9::numeric,
          'maturityDate', $10::date,
          'probabilityOfDefault', $11::numeric,
          'riskBand', $12::text,
          'expectedPortfolioLoss', $13::numeric,
          'riskNarrative', $14::text,
          'simulatedDefaultRate', $15::numeric,
          'tailRiskLoss', $16::numeric,
          'worstCaseLoss', $17::numeric
        ))
        ON CONFLICT (name, key) DO UPDATE
          SET payload = jsonb_build_object(
            'acquisitionDate', $3::timestamptz,
            'borrowerName', $4::text,
            'capitalRequirement', (projections.payload->>'capitalRequirement')::numeric + $5::numeric,  // TODO: accumulate or use new value?
            'creditRating', $6::text,
            'expectedLoss', (projections.payload->>'expectedLoss')::numeric + $7::numeric,  // TODO: accumulate or use new value?
            'interestRate', (projections.payload->>'interestRate')::numeric + $8::numeric,  // TODO: accumulate or use new value?
            'loanAmount', (projections.payload->>'loanAmount')::numeric + $9::numeric,  // TODO: accumulate or use new value?
            'maturityDate', $10::date,
            'probabilityOfDefault', (projections.payload->>'probabilityOfDefault')::numeric + $11::numeric,  // TODO: accumulate or use new value?
            'riskBand', $12::text,
            'expectedPortfolioLoss', (projections.payload->>'expectedPortfolioLoss')::numeric + $13::numeric,  // TODO: accumulate or use new value?
            'riskNarrative', $14::text,
            'simulatedDefaultRate', (projections.payload->>'simulatedDefaultRate')::numeric + $15::numeric,  // TODO: accumulate or use new value?
            'tailRiskLoss', (projections.payload->>'tailRiskLoss')::numeric + $16::numeric,  // TODO: accumulate or use new value?
            'worstCaseLoss', (projections.payload->>'worstCaseLoss')::numeric + $17::numeric,  // TODO: accumulate or use new value?
          )`,
      params: [
        projectionName,
        key,
      p.acquisitionDate,
      p.borrowerName,
      p.capitalRequirement,
      p.creditRating,
      p.expectedLoss,
      p.interestRate,
      p.loanAmount,
      p.maturityDate,
      p.probabilityOfDefault,
      p.riskBand,
      p.expectedPortfolioLoss,
      p.riskNarrative,
      p.simulatedDefaultRate,
      p.tailRiskLoss,
      p.worstCaseLoss,
      ],
    }];
  },
}
```

### Key rules
- Use `projectionName` param (from meta), never hardcode the projection name
- **$1 (projectionName) and $2 (key) are varchar — NEVER cast them as ::text**
- **Never reuse $1 or $2 inside jsonb_build_object** — that causes Postgres error 42P08 (inconsistent types)
- **Every parameter inside jsonb_build_object() MUST have a type cast** — PostgreSQL cannot infer types in jsonb context
- The example above already has the correct casts for THIS slice's field types — keep them as-is
- **Date/DateTime fields: convert to ISO string before passing as SQL param** — use `p.myDate instanceof Date ? p.myDate.toISOString() : p.myDate` in the params array
- For accumulation fields (totals, counts): read existing value with `(projections.payload->>'field')::numeric` and add the new param
- For overwrite fields (status, name): just use the param directly with the matching cast
- Composite keys: build as template literal from payload fields

## All scaffold output

  + src/BusinessCapabilities/Portfolio/slices/PortfolioLoanDetails/index.ts
  + src/BusinessCapabilities/Portfolio/slices/PortfolioLoanDetails/tests/projection.test.ts
  + src/BusinessCapabilities/Portfolio/slices/PortfolioLoanDetails/projection.slice.test.ts
  + src/BusinessCapabilities/Portfolio/slices/PortfolioLoanDetails/mcp.ts
  ~ src/BusinessCapabilities/Portfolio/slices/projections.ts
  ~ src/BusinessCapabilities/Portfolio/endpoints/mcpTools.ts
