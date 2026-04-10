# Enrichment Processor Fixture

Tests that `evdb-dev-v2` can scaffold and implement enrichment processor slices
driven by `codeGen.backendPrompts`, plus cross-context Reporting slices.

## What it tests

**Property**: The scaffold detects slices with `backendPrompts` and no commands,
generates `enrichment.ts` + `enrichment.test.ts` (not the standard command/gwts pipeline),
and the AI fills in the enrichment function body using only the backend prompts from
`TODO_CONTEXT.md`.

## Slices (all in Reporting context)

### 1. Withdrawals Pending Currency Reporting TODO (STATE_VIEW)
- **Type**: Read model only — no commands, no events
- **Readmodel**: Withdrawals Reporting (account, amount, currency, session)
- **Outbound**: feeds into the automation processor

### 2. ExchangeRate Calculator (UNDEFINED + AUTOMATION processor)
- **Type**: Enrichment processor with backendPrompts
- **Input fields**: account, amount, currency, session
- **Enriched fields** (generated: true): baseCurrencyAmount, exchangeRate, reportDate
- **Backend prompt**: Fetch exchange rate from Frankfurter API, convert to EUR
- **Inbound**: Withdrawals Reporting readmodel
- **Outbound**: Report transaction in base currency command

### 3. Report Daily BaseTransaction (STATE_CHANGE)
- **Type**: Standard command slice (also has automation processor)
- **Command**: Report transaction in base currency
- **Readmodel**: TxnReportedInBaseCurrency
- **Inbound**: automation processor (enriched data)

## Data flow

```
[Withdrawals Reporting readmodel] → [ExchangeRate Calculator automation]
    → enriches with API call → [Report Daily BaseTransaction command]
        → [TxnReportedInBaseCurrency readmodel]
```

## PASS criteria

1. Scaffold generates correct file types per slice type
2. AI fills enrichment.ts per backendPrompts
3. All tests pass
4. 0 scan violations
