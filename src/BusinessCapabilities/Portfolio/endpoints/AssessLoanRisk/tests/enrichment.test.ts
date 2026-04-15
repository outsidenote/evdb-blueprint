import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRisk Enrichment", () => {
  it("enriches input with computed fields (smoke test for unknown rating)", async () => {
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

  it("BBB credit rating with maturity < 5 years: deterministic computations", async () => {
    const now = new Date();
    // 3 years out — guaranteed < 5 year maturity, no risk weight adjustment
    const threeYearsOut = new Date(now.getTime() + 3 * 365.25 * 24 * 60 * 60 * 1000);

    const input = {
      portfolioId: "portfolio-001",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.045,
      loanAmount: 1_000_000,
      loanId: "loan-001",
      maturityDate: threeYearsOut,
    };

    const result = await enrich(input);

    // Step 1: BBB → PD = 0.0020 (0.20%)
    assert.strictEqual(result.probabilityOfDefault, 0.0020);

    // Step 2: BBB → baseRiskWeight = 0.50; maturity 3yr < 5yr → no adjustment
    // adjustedRiskWeight = 0.50

    // Step 3: capitalRequirement = 1,000,000 × 0.50 × 0.08 = 40,000
    assert.strictEqual(result.capitalRequirement, 1_000_000 * 0.50 * 0.08);

    // Step 4: expectedLoss = 1,000,000 × 0.0020 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 1_000_000 * 0.0020 * 0.45);

    // Step 5: adjustedRiskWeight 0.50 → 0.30 < 0.50 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // acquisitionDate is today
    assert.ok(result.acquisitionDate instanceof Date);

    // Monte Carlo results are stochastic — type and narrative checks only
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.riskNarrative.includes("BBB"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
  });

  it("BBB credit rating with maturity > 5 years: applies 1.15x risk weight adjustment", async () => {
    const now = new Date();
    // 7 years out — guaranteed > 5 year maturity, triggers 1.15x adjustment
    const sevenYearsOut = new Date(now.getTime() + 7 * 365.25 * 24 * 60 * 60 * 1000);

    const input = {
      portfolioId: "portfolio-002",
      borrowerName: "Beta Corp",
      creditRating: "BBB",
      interestRate: 0.05,
      loanAmount: 1_000_000,
      loanId: "loan-002",
      maturityDate: sevenYearsOut,
    };

    const result = await enrich(input);

    // Step 2: BBB → baseRiskWeight = 0.50; maturity 7yr > 5yr → ×1.15
    // adjustedRiskWeight = 0.50 × 1.15 = 0.575

    // Step 3: capitalRequirement = 1,000,000 × 0.575 × 0.08 = 46,000
    assert.strictEqual(result.capitalRequirement, 1_000_000 * (0.50 * 1.15) * 0.08);

    // Step 5: adjustedRiskWeight 0.575 → 0.55 < 0.575 ≤ 1.00 → "Speculative - High"
    assert.strictEqual(result.riskBand, "Speculative - High");
  });

  it("CCC credit rating: highest risk band and critical classification", async () => {
    const now = new Date();
    const twoYearsOut = new Date(now.getTime() + 2 * 365.25 * 24 * 60 * 60 * 1000);

    const input = {
      portfolioId: "portfolio-003",
      borrowerName: "Risky Corp",
      creditRating: "CCC",
      interestRate: 0.15,
      loanAmount: 500_000,
      loanId: "loan-003",
      maturityDate: twoYearsOut,
    };

    const result = await enrich(input);

    // Step 1: CCC → PD = 0.1000 (10.00%)
    assert.strictEqual(result.probabilityOfDefault, 0.1000);

    // Step 2: CCC → baseRiskWeight = 1.50; maturity 2yr < 5yr → no adjustment
    // adjustedRiskWeight = 1.50

    // Step 3: capitalRequirement = 500,000 × 1.50 × 0.08 = 60,000
    assert.strictEqual(result.capitalRequirement, 500_000 * 1.50 * 0.08);

    // Step 4: expectedLoss = 500,000 × 0.1000 × 0.45 = 22,500
    assert.strictEqual(result.expectedLoss, 500_000 * 0.1000 * 0.45);

    // Step 5: adjustedRiskWeight 1.50 > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");
  });
});
