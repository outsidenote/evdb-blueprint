import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRiskProcessor Enrichment", () => {
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

  it("computes deterministic fields for A-rated loan with short maturity", async () => {
    // A-rated loan, $100,000, maturity 2 years from now (< 5 years — no maturity adjustment)
    const shortMaturity = new Date(Date.now() + 2 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "p1",
      borrowerName: "Acme Corp",
      creditRating: "A",
      interestRate: 0.05,
      loanAmount: 100_000,
      loanId: "loan-1",
      maturityDate: shortMaturity,
    };

    const result = await enrich(input);

    // Step 1: PD for A = 0.05% = 0.0005
    assert.strictEqual(result.probabilityOfDefault, 0.0005);

    // Step 2: baseRiskWeight for A = 0.35; maturity 2yr < 5yr → no adjustment → adjustedRiskWeight = 0.35
    // Step 3: capitalRequirement = 100000 × 0.35 × 0.08 = 2800.00
    assert.strictEqual(result.capitalRequirement, 2800);

    // Step 4: expectedLoss = 100000 × 0.0005 × 0.45 = 22.50
    assert.strictEqual(result.expectedLoss, 22.5);

    // Step 5: adjustedRiskWeight 0.35 > 0.30 and ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // riskNarrative includes creditRating, riskBand, and simulation results
    assert.ok(result.riskNarrative.startsWith("A loan ($100000): Investment Grade - Medium."));

    // Stochastic fields: must be non-negative numbers
    assert.ok(result.simulatedDefaultRate >= 0);
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.ok(result.worstCaseLoss >= 0);
    assert.ok(result.tailRiskLoss >= 0);

    // acquisitionDate is set to current time
    assert.ok(result.acquisitionDate instanceof Date);
  });

  it("applies maturity adjustment and critical risk band for CCC-rated loan with long maturity", async () => {
    // CCC-rated loan, $100,000, maturity 10 years from now (> 5 years — 1.15× adjustment)
    const longMaturity = new Date(Date.now() + 10 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "p2",
      borrowerName: "Risky Corp",
      creditRating: "CCC",
      interestRate: 0.15,
      loanAmount: 100_000,
      loanId: "loan-2",
      maturityDate: longMaturity,
    };

    const result = await enrich(input);

    // Step 1: PD for CCC = 10.00% = 0.10
    assert.strictEqual(result.probabilityOfDefault, 0.1);

    // Step 2: baseRiskWeight for CCC = 1.50; maturity 10yr > 5yr → adjustedRiskWeight = 1.50 × 1.15 = 1.725
    // Step 3: capitalRequirement = 100000 × 1.725 × 0.08 = 13800.00
    assert.strictEqual(result.capitalRequirement, 13800);

    // Step 4: expectedLoss = 100000 × 0.10 × 0.45 = 4500.00
    assert.strictEqual(result.expectedLoss, 4500);

    // Step 5: adjustedRiskWeight 1.725 > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");

    // riskNarrative includes creditRating and riskBand
    assert.ok(result.riskNarrative.startsWith("CCC loan ($100000): Speculative - Critical."));

    // With PD=0.10 and 1000 iterations, recovery rate for CCC = 0.20
    // Each default produces loss = 100000 × (1 - 0.20) = 80000
    // Expected ~100 defaults → worstCaseLoss (VaR 95%) should be > 0
    assert.ok(result.worstCaseLoss > 0);
    assert.ok(result.tailRiskLoss > 0);
  });

  it("applies no maturity adjustment for AAA-rated loan with short maturity and returns low risk band", async () => {
    // AAA-rated loan, $1,000,000, maturity 3 years from now (< 5 years — no adjustment)
    const shortMaturity = new Date(Date.now() + 3 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "p3",
      borrowerName: "Blue Chip Inc",
      creditRating: "AAA",
      interestRate: 0.03,
      loanAmount: 1_000_000,
      loanId: "loan-3",
      maturityDate: shortMaturity,
    };

    const result = await enrich(input);

    // Step 1: PD for AAA = 0.01% = 0.0001
    assert.strictEqual(result.probabilityOfDefault, 0.0001);

    // Step 2: baseRiskWeight for AAA = 0.20; maturity 3yr < 5yr → adjustedRiskWeight = 0.20
    // Step 3: capitalRequirement = 1000000 × 0.20 × 0.08 = 16000.00
    assert.strictEqual(result.capitalRequirement, 16000);

    // Step 4: expectedLoss = 1000000 × 0.0001 × 0.45 = 45.00
    assert.strictEqual(result.expectedLoss, 45);

    // Step 5: adjustedRiskWeight 0.20 ≤ 0.30 → "Investment Grade - Low"
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
  });
});
