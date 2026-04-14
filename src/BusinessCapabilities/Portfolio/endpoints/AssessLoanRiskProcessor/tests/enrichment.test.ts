import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRiskProcessor Enrichment", () => {
  it("enriches a BBB-rated loan with short maturity (no maturity adjustment)", async () => {
    const maturityDate = new Date(Date.now() + 3 * 365.25 * 24 * 60 * 60 * 1000); // 3 years from now
    const input = {
      portfolioId: "portfolio-1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.045,
      loanAmount: 1_000_000,
      loanId: "loan-1",
      maturityDate,
    };

    const result = await enrich(input);

    // Input fields passed through
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // Deterministic fields
    assert.strictEqual(result.probabilityOfDefault, 0.0020);
    // capitalRequirement = 1_000_000 × 0.50 × 0.08 = 40_000
    assert.strictEqual(result.capitalRequirement, 40_000);
    // expectedLoss = 1_000_000 × 0.0020 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Stochastic fields — check type and plausible range
    assert.ok(result.acquisitionDate instanceof Date);
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.ok(result.worstCaseLoss >= 0);
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.tailRiskLoss >= 0);

    // Narrative shape
    assert.ok(result.riskNarrative.startsWith("BBB loan ($1000000):"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
    assert.ok(result.riskNarrative.includes("Simulated default rate:"));
    assert.ok(result.riskNarrative.includes("VaR(95%):"));
    assert.ok(result.riskNarrative.includes("Tail risk:"));
  });

  it("applies maturity adjustment for loans > 5 years (AAA rating)", async () => {
    const maturityDate = new Date(Date.now() + 10 * 365.25 * 24 * 60 * 60 * 1000); // 10 years from now
    const input = {
      portfolioId: "portfolio-2",
      borrowerName: "Acme Corp",
      creditRating: "AAA",
      interestRate: 0.03,
      loanAmount: 500_000,
      loanId: "loan-2",
      maturityDate,
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.0001);
    // adjustedRiskWeight = 0.20 × 1.15 = 0.23 → still ≤ 0.30
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
    // capitalRequirement = 500_000 × 0.23 × 0.08 = 9_200
    assert.strictEqual(result.capitalRequirement, 9_200);
  });

  it("classifies CCC-rated loan as Speculative - Critical with maturity adjustment", async () => {
    const maturityDate = new Date(Date.now() + 7 * 365.25 * 24 * 60 * 60 * 1000); // 7 years
    const input = {
      portfolioId: "portfolio-3",
      borrowerName: "Risky Corp",
      creditRating: "CCC",
      interestRate: 0.15,
      loanAmount: 200_000,
      loanId: "loan-3",
      maturityDate,
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.1000);
    // adjustedRiskWeight = 1.50 × 1.15 = 1.725 → > 1.00
    assert.strictEqual(result.riskBand, "Speculative - Critical");
    // capitalRequirement = 200_000 × 1.725 × 0.08 = 27_600
    assert.strictEqual(result.capitalRequirement, 27_600);
    // expectedLoss = 200_000 × 0.10 × 0.45 = 9_000
    assert.strictEqual(result.expectedLoss, 9_000);
  });
});
