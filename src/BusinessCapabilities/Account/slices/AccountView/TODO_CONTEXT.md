# TODO Context for AccountView

Slice: AccountView | Context: Account | Stream: Account
Type: **Projection / Read Model** (STATE_VIEW)

## Files with TODOs (only edit these)

- `slices/AccountView/index.ts` — replace generic UPSERT with proper SQL: select specific fields, handle accumulation vs overwrite
- `slices/AccountView/tests/projection.test.ts` — verify SQL params contain correct field values
- `slices/AccountView/projection.slice.test.ts` — fill event payloads and expected state (runs against real PostgreSQL via testcontainers)

## Readmodel Fields (columns of the projection)

  - `accountId`: string
  - `currency`: string
  - `name`: string

**Key**: `accountId`

## Inbound Events (triggers this projection)

  - `Accountcreated`

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

  + src/BusinessCapabilities/Account/slices/AccountView/index.ts
  + src/BusinessCapabilities/Account/slices/AccountView/tests/projection.test.ts
  + src/BusinessCapabilities/Account/slices/AccountView/projection.slice.test.ts
  + src/BusinessCapabilities/Account/slices/projections.ts
  + src/BusinessCapabilities/Account/slices/AccountView/mcp.ts
  + src/BusinessCapabilities/Account/swimlanes/Account/messages/AccountcreatedMessages.ts
  ~ src/BusinessCapabilities/Account/endpoints/mcpTools.ts
  ~ src/BusinessCapabilities/Account/swimlanes/Account/index.ts
