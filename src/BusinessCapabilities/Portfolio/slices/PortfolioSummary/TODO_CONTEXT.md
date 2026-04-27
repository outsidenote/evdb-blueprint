# TODO Context for PortfolioSummary

Slice: PortfolioSummary | Context: Portfolio | Stream: Portfolio
Type: **Projection / Read Model** (STATE_VIEW)

## Files with TODOs (only edit these)

- `slices/PortfolioSummary/index.ts` — replace generic UPSERT with proper SQL: select specific fields, handle accumulation vs overwrite
- `slices/PortfolioSummary/tests/projection.test.ts` — verify SQL params contain correct field values
- `slices/PortfolioSummary/projection.slice.test.ts` — fill event payloads and expected state (runs against real PostgreSQL via testcontainers)
- `slices/PortfolioSummary/mcp.ts` — replace `description: "@DESCRIPTION_TODO"` with a 1-3 sentence MCP tool description. Verb-first. For command tools, mention the event types from the `emits` array. State when an agent should call this tool. Do NOT touch any other field in the descriptor.

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

**Key**: `portfolioId`

## Inbound Events (triggers this projection)

  - `LoanRiskAssessed`

## Patterns (projection SQL)

```typescript
// UPSERT with accumulation using jsonb_build_object
// IMPORTANT: every $N parameter inside jsonb_build_object MUST have an explicit cast
// PostgreSQL cannot infer types in jsonb context — uncast params cause runtime errors
handlers: {
  EventName: (payload, { projectionName }) => {
    const p = payload as PayloadType;
    const key = `${p.currency}:${p.reportDate}`;  // composite key
    return [{
      sql: `
        INSERT INTO projections (name, key, payload)
        VALUES ($1, $2, jsonb_build_object(
          'account', $3::text,
          'totalAmount', $4::numeric,
          'count', 1
        ))
        ON CONFLICT (name, key) DO UPDATE
          SET payload = jsonb_build_object(
            'account', $3::text,
            'totalAmount', (projections.payload->>'totalAmount')::numeric + $4::numeric,
            'count', (projections.payload->>'count')::int + 1
          )`,
      params: [projectionName, key, p.account, p.amount],
    }];
  },
}
```

### Key rules
- Use `projectionName` param (from meta), never hardcode the projection name
- **Every parameter inside jsonb_build_object() MUST have a type cast** ($3::text, $4::numeric) — PostgreSQL cannot infer types in jsonb context
- **Date/DateTime fields: convert to ISO string before passing as SQL param** — use `p.myDate instanceof Date ? p.myDate.toISOString() : p.myDate` in the params array. The pg driver serializes Date objects with timezone offset, but jsonb should store UTC ISO strings.
- Pass individual fields as params, not JSON.stringify(p) — this enables field-level accumulation
- For accumulation fields (totals, counts): read existing value with `(projections.payload->>'field')::numeric` and add the new param
- For overwrite fields (status, name): just use the param directly ($N::text)
- Composite keys: build as template literal from payload fields

## All scaffold output

  + src/BusinessCapabilities/Portfolio/slices/PortfolioSummary/index.ts
  + src/BusinessCapabilities/Portfolio/slices/PortfolioSummary/tests/projection.test.ts
  + src/BusinessCapabilities/Portfolio/slices/PortfolioSummary/projection.slice.test.ts
  + src/BusinessCapabilities/Portfolio/slices/projections.ts
  + src/BusinessCapabilities/Portfolio/slices/PortfolioSummary/mcp.ts
  + src/BusinessCapabilities/Portfolio/swimlanes/Portfolio/messages/LoanRiskAssessedMessages.ts
  ~ src/BusinessCapabilities/Portfolio/endpoints/mcpTools.ts
  ~ src/BusinessCapabilities/Portfolio/swimlanes/Portfolio/index.ts
