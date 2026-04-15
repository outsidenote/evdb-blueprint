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

  it("computes correct deterministic fields for a BBB-rated loan (maturity ≤ 5 years)", async () => {
    // maturityDate 3 years from now — no maturity adjustment
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 3);

    const input = {
      portfolioId: "p-001",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.045,
      loanAmount: 1_000_000,
      loanId: "l-001",
      maturityDate,
    };

    const result = await enrich(input);

    // Step 1: PD for BBB = 0.20% = 0.0020
    assert.strictEqual(result.probabilityOfDefault, 0.0020);

    // Step 3: capitalRequirement = 1_000_000 × 0.50 (BBB base risk weight) × 0.08 = 40_000
    assert.strictEqual(result.capitalRequirement, 40_000);

    // Step 4: expectedLoss = 1_000_000 × 0.0020 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);

    // Step 5: adjustedRiskWeight = 0.50 → ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Step 7: simulatedDefaultRate is a number (Monte Carlo — value is stochastic)
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");

    // Narrative contains expected fragments
    assert.ok(result.riskNarrative.startsWith("BBB loan ($1000000): Investment Grade - Medium."));
    assert.ok(result.riskNarrative.includes("Simulated default rate:"));
    assert.ok(result.riskNarrative.includes("VaR(95%):"));
    assert.ok(result.riskNarrative.includes("Tail risk:"));
  });

  it("applies maturity adjustment (×1.15) when maturity > 5 years", async () => {
    // A-rated loan with maturity 7 years out
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 7);

    const input = {
      portfolioId: "p-002",
      borrowerName: "Beta Ltd",
      creditRating: "A",
      interestRate: 0.035,
      loanAmount: 500_000,
      loanId: "l-002",
      maturityDate,
    };

    const result = await enrich(input);

    // Step 1: PD for A = 0.05% = 0.0005
    assert.strictEqual(result.probabilityOfDefault, 0.0005);

    // Step 2: baseRiskWeight(A) = 0.35; maturity > 5y → adjustedRiskWeight = 0.35 × 1.15 = 0.4025
    // Step 3: capitalRequirement = 500_000 × 0.4025 × 0.08 = 16_100
    assert.strictEqual(result.capitalRequirement, 16_100);

    // Step 4: expectedLoss = 500_000 × 0.0005 × 0.45 = 112.5
    assert.strictEqual(result.expectedLoss, 112.5);

    // Step 5: adjustedRiskWeight = 0.4025 → ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");
  });

  it("assigns Speculative - Critical band for CCC-rated loan with long maturity", async () => {
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 8);

    const input = {
      portfolioId: "p-003",
      borrowerName: "Gamma Inc",
      creditRating: "CCC",
      interestRate: 0.12,
      loanAmount: 200_000,
      loanId: "l-003",
      maturityDate,
    };

    const result = await enrich(input);

    // Step 1: PD for CCC = 10% = 0.10
    assert.strictEqual(result.probabilityOfDefault, 0.10);

    // Step 2: baseRiskWeight(CCC) = 1.50; maturity > 5y → adjustedRiskWeight = 1.50 × 1.15 = 1.725
    // Step 3: capitalRequirement = 200_000 × 1.725 × 0.08 = 27_600
    assert.strictEqual(result.capitalRequirement, 27_600);

    // Step 4: expectedLoss = 200_000 × 0.10 × 0.45 = 9_000
    assert.strictEqual(result.expectedLoss, 9_000);

    // Step 5: adjustedRiskWeight = 1.725 → > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");
  });

  it("assigns Speculative - High band for BB-rated loan (maturity ≤ 5 years)", async () => {
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 2);

    const input = {
      portfolioId: "p-004",
      borrowerName: "Delta Corp",
      creditRating: "BB",
      interestRate: 0.07,
      loanAmount: 300_000,
      loanId: "l-004",
      maturityDate,
    };

    const result = await enrich(input);

    // Step 1: PD for BB = 1.00% = 0.01
    assert.strictEqual(result.probabilityOfDefault, 0.01);

    // Step 2: baseRiskWeight(BB) = 0.75; maturity ≤ 5y → adjustedRiskWeight = 0.75
    // Step 3: capitalRequirement = 300_000 × 0.75 × 0.08 = 18_000
    assert.strictEqual(result.capitalRequirement, 18_000);

    // Step 4: expectedLoss = 300_000 × 0.01 × 0.45 = 1_350
    assert.strictEqual(result.expectedLoss, 1_350);

    // Step 5: adjustedRiskWeight = 0.75 → ≤ 1.00 → "Speculative - High"
    assert.strictEqual(result.riskBand, "Speculative - High");
  });
});
