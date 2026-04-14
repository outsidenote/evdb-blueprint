import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRisk Enrichment", () => {
  it("enriches BBB-rated loan with correct deterministic fields", async () => {
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 3); // 3 years — no maturity adjustment

    const input = {
      portfolioId: "portfolio-1",
      borrowerName: "Acme Corp",
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

    // acquisitionDate must be a Date
    assert.ok(result.acquisitionDate instanceof Date);

    // Deterministic fields: BBB, $1M, 3-year maturity (no adjustment)
    // PD = 0.20%, risk weight = 0.50, no maturity adj
    assert.strictEqual(result.probabilityOfDefault, 0.002);
    assert.strictEqual(result.capitalRequirement, 40_000);   // 1M × 0.50 × 0.08
    assert.strictEqual(result.expectedLoss, 900);             // 1M × 0.002 × 0.45
    assert.strictEqual(result.riskBand, "Investment Grade - Medium"); // 0.50 ≤ 0.55

    // Monte Carlo outputs — type checks only (stochastic)
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.strictEqual(typeof result.riskNarrative, "string");
    assert.ok(result.riskNarrative.includes("BBB"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
  });

  it("applies maturity adjustment (×1.15) for loans with maturity > 5 years", async () => {
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 6); // 6 years — triggers adjustment

    const input = {
      portfolioId: "portfolio-2",
      borrowerName: "Beta Corp",
      creditRating: "A",
      interestRate: 0.04,
      loanAmount: 1_000_000,
      loanId: "loan-2",
      maturityDate,
    };

    const result = await enrich(input);

    // A rating: base risk weight = 0.35, adjusted = 0.35 × 1.15 = 0.4025
    // capitalRequirement = 1M × 0.4025 × 0.08 = 32,200
    assert.strictEqual(result.probabilityOfDefault, 0.0005); // 0.05%
    assert.strictEqual(result.capitalRequirement, 32_200);
    assert.strictEqual(result.riskBand, "Investment Grade - Medium"); // 0.4025 ≤ 0.55
  });

  it("assigns Speculative - Critical band for CCC-rated loans", async () => {
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 2); // 2 years — no adjustment

    const input = {
      portfolioId: "portfolio-3",
      borrowerName: "Distressed LLC",
      creditRating: "CCC",
      interestRate: 0.15,
      loanAmount: 500_000,
      loanId: "loan-3",
      maturityDate,
    };

    const result = await enrich(input);

    // CCC: PD = 10%, risk weight = 1.50 → Speculative - Critical
    assert.strictEqual(result.probabilityOfDefault, 0.10);
    assert.strictEqual(result.capitalRequirement, 60_000); // 500K × 1.50 × 0.08
    assert.strictEqual(result.expectedLoss, 22_500);        // 500K × 0.10 × 0.45
    assert.strictEqual(result.riskBand, "Speculative - Critical");
  });

  it("assigns Investment Grade - Low band for AAA-rated loans", async () => {
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 2);

    const input = {
      portfolioId: "portfolio-4",
      borrowerName: "Safe Corp",
      creditRating: "AAA",
      interestRate: 0.02,
      loanAmount: 2_000_000,
      loanId: "loan-4",
      maturityDate,
    };

    const result = await enrich(input);

    // AAA: risk weight = 0.20 ≤ 0.30 → Investment Grade - Low
    assert.strictEqual(result.probabilityOfDefault, 0.0001);
    assert.strictEqual(result.capitalRequirement, 32_000); // 2M × 0.20 × 0.08
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
  });
});
