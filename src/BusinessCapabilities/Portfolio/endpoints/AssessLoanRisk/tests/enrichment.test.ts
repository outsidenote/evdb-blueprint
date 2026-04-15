import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRisk Enrichment", () => {
  it("enriches input with computed fields", async () => {
    const input = {
    portfolioId: "test",
    borrowerName: "test",
    creditRating: "test",
    interestRate: 0,
    loanAmount: 0,
    loanId: "test",
    maturityDate: "test",
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

    // Verify enriched fields are populated
    assert.ok(result.acquisitionDate instanceof Date);
    assert.strictEqual(typeof result.capitalRequirement, "number");
    assert.strictEqual(typeof result.expectedLoss, "number");
    assert.strictEqual(typeof result.probabilityOfDefault, "number");
    assert.strictEqual(typeof result.riskBand, "string");
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.strictEqual(typeof result.riskNarrative, "string");
  });

  it("computes deterministic fields correctly for BBB loan within 5-year maturity", async () => {
    // BBB loan, $1,000,000, maturity 2 years from now (no maturity adjustment)
    const maturityDate = new Date(Date.now() + 2 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "portfolio-001",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.05,
      loanAmount: 1_000_000,
      loanId: "loan-001",
      maturityDate,
    };

    const result = await enrich(input);

    // Step 1: PD for BBB = 0.002
    assert.strictEqual(result.probabilityOfDefault, 0.002);

    // Step 2: Risk weight BBB = 0.50, maturity ≤ 5 years → no adjustment, adjustedRiskWeight = 0.50
    // Step 3: capitalRequirement = 1_000_000 × 0.50 × 0.08 = 40_000
    assert.strictEqual(result.capitalRequirement, 40_000);

    // Step 4: expectedLoss = 1_000_000 × 0.002 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);

    // Step 5: adjustedRiskWeight = 0.50 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Stochastic fields: just verify types and reasonable bounds
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.ok(result.worstCaseLoss >= 0);
    assert.ok(result.tailRiskLoss >= 0);

    // riskNarrative must contain the credit rating and risk band
    assert.ok(result.riskNarrative.includes("BBB"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));

    // acquisitionDate must be a recent Date
    assert.ok(result.acquisitionDate instanceof Date);
    assert.ok(result.acquisitionDate.getTime() <= Date.now());
  });

  it("applies 1.15 maturity multiplier when maturity exceeds 5 years", async () => {
    // BBB loan, $1,000,000, maturity 7 years from now → maturity adjustment applies
    const maturityDate = new Date(Date.now() + 7 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "portfolio-002",
      borrowerName: "Beta LLC",
      creditRating: "BBB",
      interestRate: 0.06,
      loanAmount: 1_000_000,
      loanId: "loan-002",
      maturityDate,
    };

    const result = await enrich(input);

    // Step 2: Risk weight BBB = 0.50, maturity > 5 years → adjustedRiskWeight = 0.50 × 1.15 = 0.575
    // Step 3: capitalRequirement = 1_000_000 × 0.575 × 0.08 = 46_000
    assert.strictEqual(result.capitalRequirement, 46_000);

    // Step 5: adjustedRiskWeight = 0.575 > 0.55 and ≤ 1.00 → "Speculative - High"
    assert.strictEqual(result.riskBand, "Speculative - High");
  });

  it("maps AAA rating to Investment Grade - Low risk band", async () => {
    // AAA loan, $500,000, maturity 3 years
    const maturityDate = new Date(Date.now() + 3 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "portfolio-003",
      borrowerName: "Gamma Inc",
      creditRating: "AAA",
      interestRate: 0.03,
      loanAmount: 500_000,
      loanId: "loan-003",
      maturityDate,
    };

    const result = await enrich(input);

    // Step 1: PD for AAA = 0.0001
    assert.strictEqual(result.probabilityOfDefault, 0.0001);

    // Step 2: Risk weight AAA = 0.20, maturity ≤ 5 years → adjustedRiskWeight = 0.20
    // Step 3: capitalRequirement = 500_000 × 0.20 × 0.08 = 8_000
    assert.strictEqual(result.capitalRequirement, 8_000);

    // Step 4: expectedLoss = 500_000 × 0.0001 × 0.45 = 22.5
    assert.strictEqual(result.expectedLoss, 22.5);

    // Step 5: adjustedRiskWeight = 0.20 ≤ 0.30 → "Investment Grade - Low"
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
  });

  it("maps CCC rating to Speculative - Critical risk band", async () => {
    // CCC loan, $200,000, maturity 2 years
    const maturityDate = new Date(Date.now() + 2 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "portfolio-004",
      borrowerName: "Delta Corp",
      creditRating: "CCC",
      interestRate: 0.15,
      loanAmount: 200_000,
      loanId: "loan-004",
      maturityDate,
    };

    const result = await enrich(input);

    // Step 1: PD for CCC = 0.10
    assert.strictEqual(result.probabilityOfDefault, 0.10);

    // Step 2: Risk weight CCC = 1.50, maturity ≤ 5 years → adjustedRiskWeight = 1.50
    // Step 3: capitalRequirement = 200_000 × 1.50 × 0.08 = 24_000
    assert.strictEqual(result.capitalRequirement, 24_000);

    // Step 4: expectedLoss = 200_000 × 0.10 × 0.45 = 9_000
    assert.strictEqual(result.expectedLoss, 9_000);

    // Step 5: adjustedRiskWeight = 1.50 > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");
  });
});
