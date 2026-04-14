import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRiskProcessor Enrichment", () => {
  it("computes deterministic fields correctly for a BBB-rated loan (short maturity)", async () => {
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

    // Input fields passed through unchanged
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // acquisitionDate is today
    assert.ok(result.acquisitionDate instanceof Date);

    // PD for BBB = 0.002
    assert.strictEqual(result.probabilityOfDefault, 0.002);

    // capitalRequirement = 1000000 * 0.50 * 0.08 = 40000
    assert.strictEqual(result.capitalRequirement, 40000);

    // expectedLoss = 1000000 * 0.002 * 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);

    // riskBand: adjustedRiskWeight=0.50 <= 0.55 → Investment Grade - Medium
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Monte Carlo results: numeric types in valid ranges
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.simulatedDefaultRate >= 0);
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.ok(result.worstCaseLoss >= 0);
    assert.ok(result.tailRiskLoss >= 0);

    // riskNarrative contains key fields
    assert.ok(result.riskNarrative.startsWith("BBB loan ($1000000):"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
  });

  it("applies maturity adjustment for long-dated loans (>5 years)", async () => {
    const maturityDate = new Date(Date.now() + 7 * 365.25 * 24 * 60 * 60 * 1000); // 7 years from now
    const input = {
      portfolioId: "portfolio-2",
      borrowerName: "Beta Inc",
      creditRating: "A",
      interestRate: 0.035,
      loanAmount: 500_000,
      loanId: "loan-2",
      maturityDate,
    };

    const result = await enrich(input);

    // A base risk weight = 0.35, adjusted = 0.35 * 1.15 = 0.4025
    const adjustedRiskWeight = 0.35 * 1.15;
    const expectedCapital = Math.round(500_000 * adjustedRiskWeight * 0.08 * 100) / 100;
    assert.strictEqual(result.capitalRequirement, expectedCapital);

    // riskBand: 0.4025 <= 0.55 → Investment Grade - Medium
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");
  });

  it("classifies CCC loans as Speculative - Critical", async () => {
    const maturityDate = new Date(Date.now() + 2 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "portfolio-3",
      borrowerName: "Risky Co",
      creditRating: "CCC",
      interestRate: 0.15,
      loanAmount: 200_000,
      loanId: "loan-3",
      maturityDate,
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.10);
    assert.strictEqual(result.riskBand, "Speculative - Critical");
    // capitalRequirement = 200000 * 1.50 * 0.08 = 24000
    assert.strictEqual(result.capitalRequirement, 24000);
    // expectedLoss = 200000 * 0.10 * 0.45 = 9000
    assert.strictEqual(result.expectedLoss, 9000);
  });

  it("classifies AAA loans as Investment Grade - Low", async () => {
    const maturityDate = new Date(Date.now() + 1 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "portfolio-4",
      borrowerName: "Prime Corp",
      creditRating: "AAA",
      interestRate: 0.02,
      loanAmount: 5_000_000,
      loanId: "loan-4",
      maturityDate,
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.0001);
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
    // capitalRequirement = 5000000 * 0.20 * 0.08 = 80000
    assert.strictEqual(result.capitalRequirement, 80000);
  });
});
