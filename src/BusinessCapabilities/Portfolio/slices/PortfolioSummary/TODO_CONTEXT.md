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
          'averageProbabilityOfDefault', $3::numeric,
          'averageRating', $4::text,
          'averageRiskWeight', $5::numeric,
          'riskBand', $6::text,
          'totalCapitalRequirement', $7::numeric,
          'totalExpectedLoss', $8::numeric,
          'totalExposure', $9::numeric,
          'totalLoans', $10::int,
          'worstRating', $11::text
        ))
        ON CONFLICT (name, key) DO UPDATE
          SET payload = jsonb_build_object(
            'averageProbabilityOfDefault', (projections.payload->>'averageProbabilityOfDefault')::numeric + $3::numeric,  // TODO: accumulate or use new value?
            'averageRating', $4::text,
            'averageRiskWeight', (projections.payload->>'averageRiskWeight')::numeric + $5::numeric,  // TODO: accumulate or use new value?
            'riskBand', $6::text,
            'totalCapitalRequirement', (projections.payload->>'totalCapitalRequirement')::numeric + $7::numeric,  // TODO: accumulate or use new value?
            'totalExpectedLoss', (projections.payload->>'totalExpectedLoss')::numeric + $8::numeric,  // TODO: accumulate or use new value?
            'totalExposure', (projections.payload->>'totalExposure')::numeric + $9::numeric,  // TODO: accumulate or use new value?
            'totalLoans', (projections.payload->>'totalLoans')::int + $10::int,  // TODO: accumulate or use new value?
            'worstRating', $11::text
          )`,
      params: [
        projectionName,
        key,
      p.averageProbabilityOfDefault,
      p.averageRating,
      p.averageRiskWeight,
      p.riskBand,
      p.totalCapitalRequirement,
      p.totalExpectedLoss,
      p.totalExposure,
      p.totalLoans,
      p.worstRating,
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
- **Date/DateTime fields are stored as ::text** — postgres `::timestamptz` produces `2024-01-15 10:30:00+00:00` but JS `.toISOString()` produces `2024-01-15T10:30:00.000Z`; these don't match in `deepStrictEqual`. Always pass `.toISOString()` strings: `p.myDate instanceof Date ? p.myDate.toISOString() : p.myDate` in the params array.
- **Numeric fields stored as ::numeric come back as JS numbers** in jsonb. Test assertions should use `loanAmount: 10000` (number), not `loanAmount: "10000"` (string).
- For accumulation fields (totals, counts): read existing value with `(projections.payload->>'field')::numeric` and add the new param
- For overwrite fields (status, name): just use the param directly with the matching cast
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
