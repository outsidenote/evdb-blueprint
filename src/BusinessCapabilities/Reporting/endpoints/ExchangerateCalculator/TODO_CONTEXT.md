# TODO Context for ExchangerateCalculator

Slice: ExchangerateCalculator | Context: Reporting | Stream: Reporting
Type: **Enrichment Processor** (backendPrompts-driven)
Trigger: **Funds Withdrawn** event via Kafka CDC (source: `message`)
Kafka topic: `events.FundsWithdrawn`

## Files with TODOs (only edit these)

- `endpoints/ExchangerateCalculator/enrichment.ts` — implement enrichment logic per backendPrompts below
- `endpoints/ExchangerateCalculator/tests/enrichment.test.ts` — verify enrichment output

## Backend Prompts (implementation instructions from the event modeler)

Enrichment: Exchange Rate Calculator

Fetch the current exchange rate between the incoming transaction currency and the base reporting currency (default: EUR) using the Frankfurter API.

API: GET https://api.frankfurter.app/latest?from={currency}&to=EUR

Example request: GET https://api.frankfurter.app/latest?from=USD&to=EUR

Example response:


{ "base": "USD", "date": "2026-04-02", "rates": { "EUR": 0.92 } }
Steps:

If currency equals EUR, set exchangeRate = 1, baseCurrencyAmount = amount, skip to step 4
Call https://api.frankfurter.app/latest?from={currency}&to=EUR
Extract rate, calculate baseCurrencyAmount = amount * rate, round to 2 decimal places
Return: exchangeRate, baseCurrencyAmount, baseCurrency = "EUR"

## Processor Fields

**Input fields** (from trigger readmodel — passed through):
  - `account`: string (example: `1234`)
  - `amount`: number (example: `21`)
  - `currency`: string (example: `USD`)
  - `session`: string (example: `0011`)

**Enriched fields** (computed by your enrichment function):
  - `baseCurrencyAmount`: number
  - `exchangeRate`: number
  - `reportDate`: Date

**Outbound**: enriched data feeds into command `Report transaction in base currency`

## Patterns

```typescript
// enrichment.ts — async function, takes input, returns input + enriched fields
export async function enrich(input: Input): Promise<Output> {
  // May call external APIs (use fetch)
  const res = await fetch(`https://api.example.com/data?q=${input.field}`);
  const data = await res.json();
  return {
    ...input,
    computedField: Math.round(data.value * 100) / 100, // round to 2dp
  };
}
```

- Handle edge cases (e.g. same-currency shortcut: skip API call)
- Round numeric results to 2 decimal places where appropriate

## All scaffold output

  + src/BusinessCapabilities/Reporting/endpoints/ExchangerateCalculator/enrichment.ts
  + src/BusinessCapabilities/Reporting/endpoints/ExchangerateCalculator/tests/enrichment.test.ts
