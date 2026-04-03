# Projection Read Model Fixture

Tests that `evdb-scaffold` can generate projection slices (STATE_VIEW type)
with ProjectionConfig, handler stubs, tests, and per-context projections.ts registry.

## What it tests

**Property**: The scaffold detects STATE_VIEW slices with readmodels and no commands,
generates a ProjectionConfig skeleton with UPSERT handler stubs for each INBOUND event,
creates a projection test, and updates the per-context projections.ts for discovery.

## Slices (Reporting context)

### Daily Currency Report (STATE_VIEW)
- **Type**: Projection / read model
- **Readmodel**: Daily Currency Report
- **Fields**: currency, reportDate, totalOriginalAmount, totalBaseCurrencyAmount, averageExchangeRate, transactionCount
- **Key**: {currency}:{reportDate}
- **INBOUND event**: TxnReportedInBaseCurrency
- **Description**: Accumulates withdrawal reports by currency+date

## PASS criteria

1. Scaffold generates ProjectionConfig index.ts with handler stubs
2. Scaffold generates projection.test.ts
3. Scaffold creates/updates per-context projections.ts
4. AI fills SQL handler logic per readmodel description
5. All tests pass
