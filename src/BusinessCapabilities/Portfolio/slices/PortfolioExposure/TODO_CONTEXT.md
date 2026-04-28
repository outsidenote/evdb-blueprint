# TODO Context for PortfolioExposure

Slice: PortfolioExposure | Context: Portfolio | Stream: Portfolio
Type: **Projection / Read Model** (STATE_VIEW)

## Files with TODOs (only edit these)

- `slices/PortfolioExposure/index.ts` — replace generic UPSERT with proper SQL: select specific fields, handle accumulation vs overwrite
- `slices/PortfolioExposure/tests/projection.test.ts` — verify SQL params contain correct field values
- `slices/PortfolioExposure/projection.slice.test.ts` — fill event payloads and expected state (runs against real PostgreSQL via testcontainers)
- `slices/PortfolioExposure/mcp.ts` — replace `description: "@DESCRIPTION_TODO"` with a 1-3 sentence MCP tool description. Verb-first. For command tools, mention the event types from the `emits` array. State when an agent should call this tool. Do NOT touch any other field in the descriptor.

## Readmodel Description (from the event modeler)

Aggregates loan exposure by credit rating within each portfolio. Key: {portfolioId}:{creditRating}.

Each LoanRiskAssessed event:

increments loanCount by 1
adds loanAmount to exposure
updates avgPD as weighted average: (prev_avgPD * prev_exposure + probabilityOfDefault * loanAmount) / (prev_exposure + loanAmount)

## Readmodel Fields (columns of the projection)

  - `creditRating`: string (example: `AAA`)
  - `portfolioId`: string (example: `PORT-01`)
  - `avgPD`: number (example: `0.5`)
  - `exposure`: number (example: `1000000`)
  - `loanCount`: number (example: `2`)

**Key**: composite key from `portfolioId, creditRating` — construct as template literal: `` `{$p.portfolioId}{p.creditRating}` ``

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
    const key = `${p.portfolioId}:${p.creditRating}`;
    return [{
      sql: `
        INSERT INTO projections (name, key, payload)
        VALUES ($1, $2, jsonb_build_object(
          'avgPD', $3::numeric,
          'exposure', $4::numeric,
          'loanCount', $5::int
        ))
        ON CONFLICT (name, key) DO UPDATE
          SET payload = jsonb_build_object(
            'avgPD', (projections.payload->>'avgPD')::numeric + $3::numeric,  // TODO: accumulate or use new value?
            'exposure', (projections.payload->>'exposure')::numeric + $4::numeric,  // TODO: accumulate or use new value?
            'loanCount', (projections.payload->>'loanCount')::int + $5::int,  // TODO: accumulate or use new value?
          )`,
      params: [
        projectionName,
        key,
      p.avgPD,
      p.exposure,
      p.loanCount,
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

  + src/BusinessCapabilities/Portfolio/slices/PortfolioExposure/index.ts
  + src/BusinessCapabilities/Portfolio/slices/PortfolioExposure/tests/projection.test.ts
  + src/BusinessCapabilities/Portfolio/slices/PortfolioExposure/projection.slice.test.ts
  + src/BusinessCapabilities/Portfolio/slices/PortfolioExposure/mcp.ts
  ~ src/BusinessCapabilities/Portfolio/slices/projections.ts
  ~ src/BusinessCapabilities/Portfolio/endpoints/mcpTools.ts
