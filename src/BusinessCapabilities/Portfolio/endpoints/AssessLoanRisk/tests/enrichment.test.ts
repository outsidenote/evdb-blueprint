import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.25;

describe("AssessLoanRisk Enrichment", () => {
  it("enriches a BBB loan (3yr maturity) with correct deterministic values", async () => {
    const maturityDate = new Date(Date.now() + 3 * MS_PER_YEAR);
    const input = {
      portfolioId: "portfolio-1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.045,
      loanAmount: 1_000_000,
      loanId: "loan-123",
      maturityDate,
    };

    const result = await enrich(input);

    // Input fields passed through unchanged
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // Acquisition date is set to now
    assert.ok(result.acquisitionDate instanceof Date);

    // BBB: PD=0.002, riskWeight=0.50 (no maturity adjustment, 3yr ≤ 5yr)
    assert.strictEqual(result.probabilityOfDefault, 0.002);
    // capitalRequirement = 1_000_000 × 0.50 × 0.08 = 40_000
    assert.ok(Math.abs(result.capitalRequirement - 40_000) < 0.01, `capitalRequirement=${result.capitalRequirement}`);
    // expectedLoss = 1_000_000 × 0.002 × 0.45 = 900
    assert.ok(Math.abs(result.expectedLoss - 900) < 0.01, `expectedLoss=${result.expectedLoss}`);
    // 0.50 ≤ 0.55 → Investment Grade - Medium
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Monte Carlo outputs — stochastic, verify types and valid ranges
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.ok(result.worstCaseLoss >= 0);
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss, "tail risk (CVaR) should be >= VaR");

    // Risk narrative contains key identifiers
    assert.ok(result.riskNarrative.includes("BBB"), "narrative should include credit rating");
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"), "narrative should include risk band");
    assert.ok(result.riskNarrative.includes("VaR(95%)"), "narrative should include VaR label");
    assert.ok(result.riskNarrative.includes("Tail risk"), "narrative should include tail risk label");
  });

  it("applies 1.15× maturity adjustment for loans with maturity > 5 years", async () => {
    const maturityDate = new Date(Date.now() + 6 * MS_PER_YEAR);
    const input = {
      portfolioId: "portfolio-2",
      borrowerName: "Beta Inc",
      creditRating: "BBB",
      interestRate: 0.05,
      loanAmount: 1_000_000,
      loanId: "loan-456",
      maturityDate,
    };

    const result = await enrich(input);

    // BBB base riskWeight=0.50 × 1.15 = 0.575 > 0.55 → Speculative - High
    assert.strictEqual(result.riskBand, "Speculative - High");
    // capitalRequirement = 1_000_000 × 0.575 × 0.08 = 46_000
    assert.ok(Math.abs(result.capitalRequirement - 46_000) < 0.01, `capitalRequirement=${result.capitalRequirement}`);
  });

  it("maps AAA rating to lowest risk band and minimal capital requirement", async () => {
    const maturityDate = new Date(Date.now() + 2 * MS_PER_YEAR);
    const input = {
      portfolioId: "portfolio-3",
      borrowerName: "Triple A Corp",
      creditRating: "AAA",
      interestRate: 0.02,
      loanAmount: 500_000,
      loanId: "loan-789",
      maturityDate,
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.0001);
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
    // capitalRequirement = 500_000 × 0.20 × 0.08 = 8_000
    assert.ok(Math.abs(result.capitalRequirement - 8_000) < 0.01);
  });

  it("maps CCC rating to highest risk band and critical capital requirement", async () => {
    const maturityDate = new Date(Date.now() + 2 * MS_PER_YEAR);
    const input = {
      portfolioId: "portfolio-4",
      borrowerName: "Junk Corp",
      creditRating: "CCC",
      interestRate: 0.15,
      loanAmount: 200_000,
      loanId: "loan-ccc",
      maturityDate,
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.10);
    assert.strictEqual(result.riskBand, "Speculative - Critical");
    // capitalRequirement = 200_000 × 1.50 × 0.08 = 24_000
    assert.ok(Math.abs(result.capitalRequirement - 24_000) < 0.01);
    // expectedLoss = 200_000 × 0.10 × 0.45 = 9_000
    assert.ok(Math.abs(result.expectedLoss - 9_000) < 0.01);
  });
});
