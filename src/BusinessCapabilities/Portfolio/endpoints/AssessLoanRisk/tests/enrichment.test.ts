import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRisk Enrichment", () => {
  it("enriches BBB-rated loan (maturity < 5 years) with correct deterministic fields", async () => {
    const input = {
      portfolioId: "portfolio-001",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.045,
      loanAmount: 1_000_000,
      loanId: "loan-001",
      maturityDate: new Date("2028-01-01"), // ~1.7 years from 2026-04-28 → < 5 years, no maturity adjustment
    };

    const result = await enrich(input);

    // Verify passthrough fields
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

    // Step 2: BBB base risk weight = 0.50; maturity < 5 years → no maturity adjustment
    // adjustedRiskWeight = 0.50
    // Step 3: capitalRequirement = 1_000_000 × 0.50 × 0.08 = 40_000
    assert.strictEqual(result.capitalRequirement, 40_000);

    // Step 4: expectedLoss = 1_000_000 × 0.0020 × 0.45 (LGD) = 900
    assert.strictEqual(result.expectedLoss, 900);

    // Step 5: adjustedRiskWeight = 0.50 → 0.30 < 0.50 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Steps 6-7: Monte Carlo results are stochastic — assert types only
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.strictEqual(typeof result.tailRiskLoss, "number");

    // Step 8: narrative includes rating, amount, and riskBand
    assert.ok(result.riskNarrative.includes("BBB loan ($1000000)"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
    assert.strictEqual(typeof result.riskNarrative, "string");
  });

  it("applies 1.15x maturity adjustment for loans with maturity > 5 years", async () => {
    const input = {
      portfolioId: "portfolio-002",
      borrowerName: "Beta Inc",
      creditRating: "A",
      interestRate: 0.035,
      loanAmount: 2_000_000,
      loanId: "loan-002",
      maturityDate: new Date("2035-01-01"), // ~8.7 years from 2026-04-28 → > 5 years, apply × 1.15
    };

    const result = await enrich(input);

    // Step 1: A → PD = 0.05% = 0.0005
    assert.strictEqual(result.probabilityOfDefault, 0.0005);

    // Step 2: A base risk weight = 0.35; maturity > 5 years → × 1.15
    // adjustedRiskWeight = 0.35 × 1.15 = 0.4025
    // Step 3: capitalRequirement = 2_000_000 × 0.4025 × 0.08 = 64_400
    assert.strictEqual(result.capitalRequirement, 64_400);

    // Step 4: expectedLoss = 2_000_000 × 0.0005 × 0.45 = 450
    assert.strictEqual(result.expectedLoss, 450);

    // Step 5: adjustedRiskWeight = 0.4025 → 0.30 < 0.4025 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");
  });

  it("assigns 'Investment Grade - Low' band for AAA-rated short-maturity loans", async () => {
    const input = {
      portfolioId: "portfolio-003",
      borrowerName: "Safe Co",
      creditRating: "AAA",
      interestRate: 0.02,
      loanAmount: 5_000_000,
      loanId: "loan-003",
      maturityDate: new Date("2029-01-01"), // ~2.7 years → < 5 years, no adjustment
    };

    const result = await enrich(input);

    // Step 1: AAA → PD = 0.01% = 0.0001
    assert.strictEqual(result.probabilityOfDefault, 0.0001);

    // Step 2: AAA base risk weight = 0.20; maturity < 5 years → no adjustment
    // adjustedRiskWeight = 0.20
    // Step 3: capitalRequirement = 5_000_000 × 0.20 × 0.08 = 80_000
    assert.strictEqual(result.capitalRequirement, 80_000);

    // Step 4: expectedLoss = 5_000_000 × 0.0001 × 0.45 = 225
    assert.strictEqual(result.expectedLoss, 225);

    // Step 5: adjustedRiskWeight = 0.20 ≤ 0.30 → "Investment Grade - Low"
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
  });

  it("assigns 'Speculative - High' band for BB-rated loans", async () => {
    const input = {
      portfolioId: "portfolio-004",
      borrowerName: "Mid Risk LLC",
      creditRating: "BB",
      interestRate: 0.08,
      loanAmount: 1_000_000,
      loanId: "loan-004",
      maturityDate: new Date("2028-06-01"), // ~2.1 years → < 5 years, no adjustment
    };

    const result = await enrich(input);

    // Step 1: BB → PD = 1.00% = 0.0100
    assert.strictEqual(result.probabilityOfDefault, 0.0100);

    // Step 2: BB base risk weight = 0.75; maturity < 5 years → no adjustment
    // adjustedRiskWeight = 0.75
    // Step 3: capitalRequirement = 1_000_000 × 0.75 × 0.08 = 60_000
    assert.strictEqual(result.capitalRequirement, 60_000);

    // Step 4: expectedLoss = 1_000_000 × 0.0100 × 0.45 = 4_500
    assert.strictEqual(result.expectedLoss, 4_500);

    // Step 5: adjustedRiskWeight = 0.75 → 0.55 < 0.75 ≤ 1.00 → "Speculative - High"
    assert.strictEqual(result.riskBand, "Speculative - High");
  });

  it("assigns 'Speculative - Critical' band for CCC-rated loans", async () => {
    const input = {
      portfolioId: "portfolio-005",
      borrowerName: "Risky Co",
      creditRating: "CCC",
      interestRate: 0.15,
      loanAmount: 500_000,
      loanId: "loan-005",
      maturityDate: new Date("2028-06-01"), // ~2.1 years → < 5 years, no adjustment
    };

    const result = await enrich(input);

    // Step 1: CCC → PD = 10.00% = 0.1000
    assert.strictEqual(result.probabilityOfDefault, 0.1000);

    // Step 2: CCC base risk weight = 1.50; maturity < 5 years → no adjustment
    // adjustedRiskWeight = 1.50
    // Step 3: capitalRequirement = 500_000 × 1.50 × 0.08 = 60_000
    assert.strictEqual(result.capitalRequirement, 60_000);

    // Step 4: expectedLoss = 500_000 × 0.1000 × 0.45 = 22_500
    assert.strictEqual(result.expectedLoss, 22_500);

    // Step 5: adjustedRiskWeight = 1.50 > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");
  });

  it("applies 1.15x maturity adjustment for CCC long-maturity loan raising risk weight above 1.00", async () => {
    const input = {
      portfolioId: "portfolio-006",
      borrowerName: "Long Risk Corp",
      creditRating: "BB",
      interestRate: 0.09,
      loanAmount: 1_000_000,
      loanId: "loan-006",
      maturityDate: new Date("2035-01-01"), // ~8.7 years → > 5 years, apply × 1.15
    };

    const result = await enrich(input);

    // Step 2: BB base risk weight = 0.75; maturity > 5 years → × 1.15
    // adjustedRiskWeight = 0.75 × 1.15 = 0.8625
    // Step 3: capitalRequirement = 1_000_000 × 0.8625 × 0.08 = 69_000
    assert.strictEqual(result.capitalRequirement, 69_000);

    // Step 5: adjustedRiskWeight = 0.8625 → 0.55 < 0.8625 ≤ 1.00 → "Speculative - High"
    assert.strictEqual(result.riskBand, "Speculative - High");
  });
});
