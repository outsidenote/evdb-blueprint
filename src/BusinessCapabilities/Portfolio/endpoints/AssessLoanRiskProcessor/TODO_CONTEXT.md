# TODO Context for AssessLoanRiskProcessor

Slice: AssessLoanRiskProcessor | Context: Portfolio | Stream: Portfolio
Type: **Enrichment Processor** (backendPrompts-driven)
Trigger: **Loans Pending Risk Assess** readmodel via outbox (source: `event`)

## Files with TODOs (only edit these)

- `endpoints/AssessLoanRiskProcessor/enrichment.ts` — implement enrichment logic per backendPrompts below
- `endpoints/AssessLoanRiskProcessor/tests/enrichment.test.ts` — verify enrichment output

## Backend Prompts (implementation instructions from the event modeler)

Risk assessment engine for CLO portfolio loans.

Step 1: Map credit rating to probability of default (PD): AAA→0.01%, AA→0.02%, A→0.05%, BBB→0.20%, BB→1.00%, B→3.00%, CCC→10.00%.

Step 2: Calculate risk weight using Basel III standardized approach: AAA→0.20, AA→0.25, A→0.35, BBB→0.50, BB→0.75, B→1.00, CCC→1.50. Adjust for maturity: if maturity > 5 years, multiply risk weight by 1.15.

Step 3: Calculate capitalRequirement = loanAmount × adjustedRiskWeight × 0.08.

Step 4: Calculate expectedLoss = loanAmount × probabilityOfDefault × 0.45 (LGD assumption 45%).

Step 5: Derive riskBand from adjusted risk weight: ≤ 0.30 → "Investment Grade - Low", ≤ 0.55 → "Investment Grade - Medium", ≤ 1.00 → "Speculative - High", > 1.00 → "Speculative - Critical".

Step 6: Run Monte Carlo simulation (1000 iterations) for loan default probability:

For each iteration, generate a random number between 0 and 1
If random < probabilityOfDefault, the loan defaults in this scenario
If defaulted, apply recovery rate: loss = loanAmount × (1 - recoveryRate). Recovery rate by rating: AAA-A→0.70, BBB→0.55, BB→0.40, B→0.30, CCC→0.20
Track: number of defaults, total simulated losses
Step 7: Compute simulation results:

simulatedDefaultRate = defaults / 1000 (should approximate the PD)
expectedPortfolioLoss = average loss across all iterations
worstCaseLoss = 95th percentile loss (VaR at 95% confidence)
tailRiskLoss = average of worst 5% scenarios (CVaR / Expected Shortfall)
Step 8: Build riskNarrative: "{creditRating} loan (${loanAmount}): {riskBand}. Simulated default rate: {simulatedDefaultRate}%. Expected loss: ${expectedPortfolioLoss}. VaR(95%): ${worstCaseLoss}. Tail risk: ${tailRiskLoss}

## Processor Fields

**Input fields** (from trigger readmodel — passed through):
  - `portfolioId`: string
  - `borrowerName`: string
  - `creditRating`: string
  - `interestRate`: number
  - `loanAmount`: number
  - `loanId`: string
  - `maturityDate`: Date

**Enriched fields** (computed by your enrichment function):
  - `acquisitionDate`: Date
  - `capitalRequirement`: number
  - `expectedLoss`: number
  - `probabilityOfDefault`: number
  - `riskBand`: string
  - `simulatedDefaultRate`: number
  - `expectedPortfolioLoss`: number
  - `worstCaseLoss`: number
  - `tailRiskLoss`: number
  - `riskNarrative`: string

**Outbound**: enriched data feeds into command `assess loan risk`

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

  + src/BusinessCapabilities/Portfolio/endpoints/AssessLoanRiskProcessor/enrichment.ts
  + src/BusinessCapabilities/Portfolio/endpoints/AssessLoanRiskProcessor/tests/enrichment.test.ts
