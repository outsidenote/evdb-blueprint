import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRisk Enrichment", () => {
  it("computes deterministic risk fields for BBB-rated short-maturity loan", async () => {
    const input = {
      portfolioId: "portfolio-001",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.05,
      loanAmount: 1_000_000,
      loanId: "loan-001",
      // ~2.7 years from 2026-04-15 → maturity < 5 years → no adjustment
      maturityDate: new Date("2029-01-01"),
    };

    const result = await enrich(input);

    // Verify pass-through fields
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // acquisitionDate is set at enrichment time
    assert.ok(result.acquisitionDate instanceof Date);

    // Step 1: BBB → PD = 0.0020 (0.20%)
    assert.strictEqual(result.probabilityOfDefault, 0.0020);

    // Step 2: BBB baseRiskWeight = 0.50; maturity ~2.7 years < 5 → adjustedRiskWeight = 0.50
    // Step 3: capitalRequirement = 1_000_000 × 0.50 × 0.08 = 40_000
    assert.strictEqual(result.capitalRequirement, 40_000);

    // Step 4: expectedLoss = 1_000_000 × 0.0020 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);

    // Step 5: adjustedRiskWeight 0.50 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Steps 6 & 7: Monte Carlo results are stochastic — check types and plausible bounds
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);

    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.ok(result.expectedPortfolioLoss >= 0);

    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.ok(result.worstCaseLoss >= 0);

    // tailRiskLoss (CVaR) must be ≥ VaR by definition
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss);

    // Step 8: Narrative contains key identifiers
    assert.strictEqual(typeof result.riskNarrative, "string");
    assert.ok(result.riskNarrative.includes("BBB"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
  });

  it("applies 1.15x maturity adjustment for long-maturity AAA loan (>5 years)", async () => {
    const input = {
      portfolioId: "portfolio-002",
      borrowerName: "LongTerm Inc",
      creditRating: "AAA",
      interestRate: 0.03,
      loanAmount: 500_000,
      loanId: "loan-002",
      // ~8.7 years from 2026-04-15 → maturity > 5 years → apply 1.15x adjustment
      maturityDate: new Date("2035-01-01"),
    };

    const result = await enrich(input);

    // Step 1: AAA → PD = 0.0001 (0.01%)
    assert.strictEqual(result.probabilityOfDefault, 0.0001);

    // Step 2: AAA baseRiskWeight = 0.20; maturity ~8.7 years > 5 → adjustedRiskWeight = 0.20 × 1.15 = 0.23
    // Step 3: capitalRequirement = 500_000 × 0.23 × 0.08 = 9_200
    assert.ok(Math.abs(result.capitalRequirement - 9_200) < 0.01,
      `capitalRequirement expected ~9200, got ${result.capitalRequirement}`);

    // Step 4: expectedLoss = 500_000 × 0.0001 × 0.45 = 22.5
    assert.strictEqual(result.expectedLoss, 22.5);

    // Step 5: adjustedRiskWeight ≈ 0.23 ≤ 0.30 → "Investment Grade - Low"
    assert.strictEqual(result.riskBand, "Investment Grade - Low");

    assert.ok(result.riskNarrative.includes("AAA"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Low"));
  });

  it("passes through input fields and populates all enriched fields for unknown rating", async () => {
    const input = {
      portfolioId: "test",
      borrowerName: "test",
      creditRating: "test",
      interestRate: 0,
      loanAmount: 0,
      loanId: "test",
      maturityDate: new Date("2025-01-01"),
    };

    const result = await enrich(input);

    // Pass-through fields unchanged
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // Enriched fields are all populated with correct types
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
});
