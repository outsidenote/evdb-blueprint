# TODO Context for LoanSubmissionStatus

Slice: LoanSubmissionStatus | Context: Portfolio | Stream: Portfolio
Type: **Projection / Read Model** (STATE_VIEW)

## Files with TODOs (only edit these)

- `slices/LoanSubmissionStatus/index.ts` — replace generic UPSERT with proper SQL: select specific fields, handle accumulation vs overwrite
- `slices/LoanSubmissionStatus/tests/projection.test.ts` — verify SQL params contain correct field values
- `slices/LoanSubmissionStatus/projection.slice.test.ts` — fill event payloads and expected state (runs against real PostgreSQL via testcontainers)
- `slices/LoanSubmissionStatus/mcp.ts` — replace `description: "@DESCRIPTION_TODO"` with a 1-3 sentence MCP tool description. Verb-first. For command tools, mention the event types from the `emits` array. State when an agent should call this tool. Do NOT touch any other field in the descriptor.

## Readmodel Fields (columns of the projection)

  - `portfolioId`: string
  - `borrowerName`: string
  - `creditRating`: string
  - `interestRate`: number
  - `loanAmount`: number
  - `loanId`: string
  - `maturityDate`: Date
  - `errorMessage`: string

**Key**: `portfolioId`

## Inbound Events (triggers this projection)

  - `LoanAddedToPortfolio`
  - `LoanRejectedFromPortfolio`

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
          'borrowerName', $3::text,
          'creditRating', $4::text,
          'interestRate', $5::numeric,
          'loanAmount', $6::numeric,
          'loanId', $7::text,
          'maturityDate', $8::text,
          'errorMessage', $9::text
        ))
        ON CONFLICT (name, key) DO UPDATE
          SET payload = jsonb_build_object(
            'borrowerName', $3::text,
            'creditRating', $4::text,
            'interestRate', (projections.payload->>'interestRate')::numeric + $5::numeric,  // TODO: accumulate or use new value?
            'loanAmount', (projections.payload->>'loanAmount')::numeric + $6::numeric,  // TODO: accumulate or use new value?
            'loanId', $7::text,
            'maturityDate', $8::text,
            'errorMessage', $9::text
          )`,
      params: [
        projectionName,
        key,
      p.borrowerName,
      p.creditRating,
      p.interestRate,
      p.loanAmount,
      p.loanId,
      p.maturityDate,
      p.errorMessage,
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

  + src/BusinessCapabilities/Portfolio/slices/LoanSubmissionStatus/index.ts
  + src/BusinessCapabilities/Portfolio/slices/LoanSubmissionStatus/tests/projection.test.ts
  + src/BusinessCapabilities/Portfolio/slices/LoanSubmissionStatus/projection.slice.test.ts
  + src/BusinessCapabilities/Portfolio/slices/LoanSubmissionStatus/mcp.ts
  + src/BusinessCapabilities/Portfolio/swimlanes/Portfolio/messages/LoanRejectedFromPortfolioMessages.ts
  ~ src/BusinessCapabilities/Portfolio/slices/projections.ts
  ~ src/BusinessCapabilities/Portfolio/endpoints/mcpTools.ts
  ~ src/BusinessCapabilities/Portfolio/swimlanes/Portfolio/index.ts
