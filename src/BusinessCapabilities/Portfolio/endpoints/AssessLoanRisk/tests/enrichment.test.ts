import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRisk Enrichment", () => {
  it("enriches input with computed fields", async () => {
    // BBB-rated loan of $1,000,000 with 3-year maturity (< 5 years → no maturity adjustment)
    const maturityDate = new Date(Date.now() + 3 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "portfolio-1",
      borrowerName: "Test Borrower",
      creditRating: "BBB",
      interestRate: 0.05,
      loanAmount: 1_000_000,
      loanId: "loan-1",
      maturityDate,
    };

    const result = await enrich(input);

    // Verify input fields are passed through
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // Verify acquisitionDate is set to approximately now
    assert.ok(result.acquisitionDate instanceof Date);

    // Step 1: BBB → PD = 0.20% = 0.002
    assert.strictEqual(result.probabilityOfDefault, 0.002);

    // Step 2: BBB base risk weight = 0.50; maturity 3 years ≤ 5 → no adjustment → adjustedRiskWeight = 0.50
    // Step 3: capitalRequirement = 1,000,000 × 0.50 × 0.08 = 40,000
    assert.strictEqual(result.capitalRequirement, 40_000);

    // Step 4: expectedLoss = 1,000,000 × 0.002 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);

    // Step 5: adjustedRiskWeight 0.50 > 0.30 and ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Steps 6-7: Monte Carlo fields are stochastic — verify types and valid ranges
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.ok(result.worstCaseLoss >= 0);
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.tailRiskLoss >= 0);

    // Step 8: riskNarrative contains key identifying fields
    assert.strictEqual(typeof result.riskNarrative, "string");
    assert.ok(result.riskNarrative.includes("BBB"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
  });

  it("applies maturity adjustment for loans with maturity > 5 years", async () => {
    // BBB-rated loan of $1,000,000 with 7-year maturity (> 5 years → risk weight × 1.15)
    const maturityDate = new Date(Date.now() + 7 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "portfolio-2",
      borrowerName: "Long Term Borrower",
      creditRating: "BBB",
      interestRate: 0.06,
      loanAmount: 1_000_000,
      loanId: "loan-2",
      maturityDate,
    };

    const result = await enrich(input);

    // Step 2: BBB base risk weight = 0.50; maturity 7 years > 5 → adjustedRiskWeight = 0.50 × 1.15 = 0.575
    // Step 3: capitalRequirement = 1,000,000 × 0.575 × 0.08 = 46,000
    assert.strictEqual(result.capitalRequirement, 46_000);

    // Step 5: adjustedRiskWeight 0.575 > 0.55 and ≤ 1.00 → "Speculative - High"
    assert.strictEqual(result.riskBand, "Speculative - High");
  });
});
