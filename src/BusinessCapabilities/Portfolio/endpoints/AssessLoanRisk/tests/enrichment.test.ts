import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRisk Enrichment", () => {
  it("enriches BBB loan with computed fields (maturity < 5 years, no maturity adjustment)", async () => {
    const input = {
      portfolioId: "portfolio-1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.05,
      loanAmount: 1_000_000,
      loanId: "loan-1",
      // 2028-01-01 is ~1.7 years from 2026-04-15 → maturity < 5 years, no adjustment
      maturityDate: new Date("2028-01-01"),
    };

    const result = await enrich(input);

    // Verify input fields are passed through unchanged
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // acquisitionDate is set to current time at enrichment
    assert.ok(result.acquisitionDate instanceof Date);

    // Step 1: BBB → PD = 0.20% = 0.0020
    assert.strictEqual(result.probabilityOfDefault, 0.0020);

    // Step 2: BBB → baseRiskWeight = 0.50; maturity ~1.7 years < 5 → adjustedRiskWeight = 0.50
    // Step 3: capitalRequirement = 1_000_000 × 0.50 × 0.08 = 40_000
    assert.strictEqual(result.capitalRequirement, 40_000);

    // Step 4: expectedLoss = 1_000_000 × 0.0020 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);

    // Step 5: adjustedRiskWeight = 0.50 → 0.30 < 0.50 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Step 6-7: Monte Carlo (stochastic) — assert types and valid ranges
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.ok(result.worstCaseLoss >= 0);
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.tailRiskLoss >= 0);

    // Step 8: riskNarrative format — starts with rating/amount, contains risk band
    assert.strictEqual(typeof result.riskNarrative, "string");
    assert.ok(result.riskNarrative.startsWith("BBB loan ($1000000):"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
  });

  it("applies maturity adjustment (× 1.15) for AAA loan maturing in > 5 years", async () => {
    const input = {
      portfolioId: "portfolio-2",
      borrowerName: "Beta Corp",
      creditRating: "AAA",
      interestRate: 0.03,
      loanAmount: 500_000,
      loanId: "loan-2",
      // 2035-01-01 is ~8.7 years from 2026-04-15 → maturity > 5 years, adjustment applies
      maturityDate: new Date("2035-01-01"),
    };

    const result = await enrich(input);

    // Step 1: AAA → PD = 0.01% = 0.0001
    assert.strictEqual(result.probabilityOfDefault, 0.0001);

    // Step 2: AAA → baseRiskWeight = 0.20; maturity ~8.7 years > 5 → adjustedRiskWeight = 0.20 × 1.15 = 0.23
    // Step 3: capitalRequirement = 500_000 × 0.23 × 0.08 ≈ 9_200 (floating-point approximate)
    assert.ok(Math.abs(result.capitalRequirement - 9_200) < 0.01);

    // Step 4: expectedLoss = 500_000 × 0.0001 × 0.45 = 22.5
    assert.strictEqual(result.expectedLoss, 22.5);

    // Step 5: adjustedRiskWeight = 0.23 ≤ 0.30 → "Investment Grade - Low"
    assert.strictEqual(result.riskBand, "Investment Grade - Low");

    // Step 8: riskNarrative format
    assert.ok(result.riskNarrative.startsWith("AAA loan ($500000):"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Low"));
  });

  it("assigns Speculative - Critical band for CCC loan", async () => {
    const input = {
      portfolioId: "portfolio-3",
      borrowerName: "Gamma Corp",
      creditRating: "CCC",
      interestRate: 0.15,
      loanAmount: 100_000,
      loanId: "loan-3",
      // Short maturity — no adjustment
      maturityDate: new Date("2027-01-01"),
    };

    const result = await enrich(input);

    // Step 1: CCC → PD = 10.00% = 0.1000
    assert.strictEqual(result.probabilityOfDefault, 0.1000);

    // Step 2: CCC → baseRiskWeight = 1.50; maturity < 5 years → adjustedRiskWeight = 1.50
    // Step 3: capitalRequirement = 100_000 × 1.50 × 0.08 = 12_000
    assert.strictEqual(result.capitalRequirement, 12_000);

    // Step 4: expectedLoss = 100_000 × 0.10 × 0.45 = 4_500
    assert.strictEqual(result.expectedLoss, 4_500);

    // Step 5: adjustedRiskWeight = 1.50 > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");
  });
});
