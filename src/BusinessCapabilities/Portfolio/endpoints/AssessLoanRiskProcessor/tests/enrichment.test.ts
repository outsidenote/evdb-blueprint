import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

// Helper: date N years from now
function yearsFromNow(n: number): Date {
  return new Date(Date.now() + n * 365.25 * 24 * 60 * 60 * 1000);
}

describe("AssessLoanRiskProcessor Enrichment", () => {
  it("BBB loan, short maturity — deterministic fields", async () => {
    const input = {
      portfolioId: "port-1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 5,
      loanAmount: 1_000_000,
      loanId: "loan-1",
      maturityDate: yearsFromNow(3), // < 5 years → no maturity adjustment
    };

    const result = await enrich(input);

    // Pass-through fields
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // acquisitionDate is set to "now"
    assert.ok(result.acquisitionDate instanceof Date);

    // Step 1: PD for BBB = 0.0020
    assert.strictEqual(result.probabilityOfDefault, 0.002);

    // Step 3: capitalRequirement = loanAmount × adjustedRiskWeight × 0.08
    // = 1,000,000 × 0.50 × 0.08 = 40,000
    assert.strictEqual(result.capitalRequirement, 40_000);

    // Step 4: expectedLoss = loanAmount × PD × LGD
    // = 1,000,000 × 0.002 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);

    // Step 5: adjustedRiskWeight = 0.50 → ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");
  });

  it("AAA loan, long maturity — maturity adjustment applied", async () => {
    const input = {
      portfolioId: "port-2",
      borrowerName: "Safe Corp",
      creditRating: "AAA",
      interestRate: 3,
      loanAmount: 500_000,
      loanId: "loan-2",
      maturityDate: yearsFromNow(7), // > 5 years → multiply risk weight by 1.15
    };

    const result = await enrich(input);

    // Step 1: PD for AAA = 0.0001
    assert.strictEqual(result.probabilityOfDefault, 0.0001);

    // Step 2: adjustedRiskWeight = 0.20 × 1.15 = 0.23
    // Step 3: capitalRequirement = 500,000 × 0.23 × 0.08 = 9,200
    assert.strictEqual(result.capitalRequirement, 9_200);

    // Step 4: expectedLoss = 500,000 × 0.0001 × 0.45 = 22.5
    assert.strictEqual(result.expectedLoss, 22.5);

    // Step 5: adjustedRiskWeight = 0.23 → ≤ 0.30 → "Investment Grade - Low"
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
  });

  it("B loan, short maturity — Speculative-High boundary", async () => {
    const input = {
      portfolioId: "port-3",
      borrowerName: "Risky Corp",
      creditRating: "B",
      interestRate: 8,
      loanAmount: 1_000_000,
      loanId: "loan-3",
      maturityDate: yearsFromNow(2), // < 5 years → no adjustment
    };

    const result = await enrich(input);

    // Step 1: PD for B = 0.03
    assert.strictEqual(result.probabilityOfDefault, 0.03);

    // Step 3: capitalRequirement = 1,000,000 × 1.00 × 0.08 = 80,000
    assert.strictEqual(result.capitalRequirement, 80_000);

    // Step 4: expectedLoss = 1,000,000 × 0.03 × 0.45 = 13,500
    assert.strictEqual(result.expectedLoss, 13_500);

    // Step 5: adjustedRiskWeight = 1.00 → ≤ 1.00 → "Speculative - High"
    assert.strictEqual(result.riskBand, "Speculative - High");
  });

  it("CCC loan, long maturity — Speculative-Critical with maturity bump", async () => {
    const input = {
      portfolioId: "port-4",
      borrowerName: "Distressed LLC",
      creditRating: "CCC",
      interestRate: 15,
      loanAmount: 2_000_000,
      loanId: "loan-4",
      maturityDate: yearsFromNow(8), // > 5 years → multiply by 1.15
    };

    const result = await enrich(input);

    // Step 1: PD for CCC = 0.10
    assert.strictEqual(result.probabilityOfDefault, 0.10);

    // Step 2: adjustedRiskWeight = 1.50 × 1.15 = 1.725
    // Step 3: capitalRequirement = 2,000,000 × 1.725 × 0.08 = 276,000
    assert.strictEqual(result.capitalRequirement, 276_000);

    // Step 4: expectedLoss = 2,000,000 × 0.10 × 0.45 = 90,000
    assert.strictEqual(result.expectedLoss, 90_000);

    // Step 5: adjustedRiskWeight = 1.725 → > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");

    // Monte Carlo: CCC has PD=10%, expect non-trivial defaults in 1000 runs
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.ok(result.expectedPortfolioLoss >= 0);
    // Recovery for CCC = 0.20 → lossPerDefault = 2,000,000 × 0.80 = 1,600,000
    // With ~10% default rate, expectedPortfolioLoss ≈ 160,000 — well above 0
    assert.ok(result.expectedPortfolioLoss > 0);
    // CVaR (tailRiskLoss) must be ≥ VaR (worstCaseLoss) at same confidence level
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss);
  });

  it("Monte Carlo output types and invariants — BB loan", async () => {
    const input = {
      portfolioId: "port-5",
      borrowerName: "Mid Corp",
      creditRating: "BB",
      interestRate: 6,
      loanAmount: 750_000,
      loanId: "loan-5",
      maturityDate: yearsFromNow(4),
    };

    const result = await enrich(input);

    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.strictEqual(typeof result.riskNarrative, "string");

    // simulatedDefaultRate is a fraction in [0, 1]
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);

    // All loss metrics are non-negative
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.ok(result.worstCaseLoss >= 0);
    assert.ok(result.tailRiskLoss >= 0);

    // CVaR must be ≥ VaR (tail average ≥ threshold at same percentile)
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss);

    // Narrative contains credit rating and risk band
    // Step 5: adjustedRiskWeight = 0.75 (no maturity adj) → ≤ 1.00 → "Speculative - High"
    assert.ok(result.riskNarrative.includes("BB"));
    assert.ok(result.riskNarrative.includes("Speculative - High"));
    assert.ok(result.riskNarrative.length > 0);
  });

  it("riskNarrative format matches expected pattern — BBB loan", async () => {
    const input = {
      portfolioId: "port-6",
      borrowerName: "Format Corp",
      creditRating: "BBB",
      interestRate: 4.5,
      loanAmount: 500_000,
      loanId: "loan-6",
      maturityDate: yearsFromNow(2),
    };

    const result = await enrich(input);

    // Narrative: "{rating} loan (${amount}): {band}. Simulated default rate: X%. ..."
    // Step 5: adjustedRiskWeight = 0.50 → "Investment Grade - Medium"
    assert.ok(result.riskNarrative.startsWith("BBB loan ($500000):"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
    assert.ok(result.riskNarrative.includes("Simulated default rate:"));
    assert.ok(result.riskNarrative.includes("Expected loss:"));
    assert.ok(result.riskNarrative.includes("VaR(95%):"));
    assert.ok(result.riskNarrative.includes("Tail risk:"));
  });
});
