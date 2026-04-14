import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRiskProcessor Enrichment", () => {
  it("computes deterministic risk fields for BBB-rated loan under 5 years", async () => {
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 3);

    const input = {
      portfolioId: "port-1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.05,
      loanAmount: 1000000,
      loanId: "loan-1",
      maturityDate,
    };

    const result = await enrich(input);

    // Pass-through fields
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // Deterministic enriched fields
    // BBB: PD=0.002, riskWeight=0.50 (no maturity adjustment)
    assert.ok(result.acquisitionDate instanceof Date);
    assert.strictEqual(result.probabilityOfDefault, 0.002);
    // capitalRequirement = 1000000 × 0.50 × 0.08 = 40000
    assert.strictEqual(result.capitalRequirement, 40000);
    // expectedLoss = 1000000 × 0.002 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);
    // adjustedRiskWeight 0.50 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Monte Carlo fields — stochastic but bounded
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.ok(result.worstCaseLoss >= 0);
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.tailRiskLoss >= 0);

    // Risk narrative structure
    assert.ok(result.riskNarrative.startsWith("BBB loan ($1000000):"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
    assert.ok(result.riskNarrative.includes("Simulated default rate:"));
    assert.ok(result.riskNarrative.includes("VaR(95%):"));
    assert.ok(result.riskNarrative.includes("Tail risk:"));
  });

  it("applies maturity adjustment for loans over 5 years", async () => {
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 7);

    const input = {
      portfolioId: "port-2",
      borrowerName: "Beta Inc",
      creditRating: "BBB",
      interestRate: 0.06,
      loanAmount: 1000000,
      loanId: "loan-2",
      maturityDate,
    };

    const result = await enrich(input);

    // BBB base risk weight = 0.50, adjusted = 0.50 × 1.15 = 0.575
    // capitalRequirement = 1000000 × 0.575 × 0.08 = 46000
    assert.strictEqual(result.capitalRequirement, 46000);
    // adjustedRiskWeight 0.575 > 0.55 → "Speculative - High"
    assert.strictEqual(result.riskBand, "Speculative - High");
  });

  it("handles CCC-rated loan with highest risk classification", async () => {
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 2);

    const input = {
      portfolioId: "port-3",
      borrowerName: "Risky Co",
      creditRating: "CCC",
      interestRate: 0.15,
      loanAmount: 500000,
      loanId: "loan-3",
      maturityDate,
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.10);
    // capitalRequirement = 500000 × 1.50 × 0.08 = 60000
    assert.strictEqual(result.capitalRequirement, 60000);
    // expectedLoss = 500000 × 0.10 × 0.45 = 22500
    assert.strictEqual(result.expectedLoss, 22500);
    assert.strictEqual(result.riskBand, "Speculative - Critical");
    // With PD=10%, Monte Carlo should produce meaningful loss values
    assert.ok(result.expectedPortfolioLoss > 0);
    assert.ok(result.riskNarrative.startsWith("CCC loan ($500000):"));
  });

  it("handles AAA-rated loan with lowest risk classification", async () => {
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 1);

    const input = {
      portfolioId: "port-4",
      borrowerName: "Prime Corp",
      creditRating: "AAA",
      interestRate: 0.02,
      loanAmount: 2000000,
      loanId: "loan-4",
      maturityDate,
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.0001);
    // capitalRequirement = 2000000 × 0.20 × 0.08 = 32000
    assert.strictEqual(result.capitalRequirement, 32000);
    // expectedLoss = 2000000 × 0.0001 × 0.45 = 90
    assert.strictEqual(result.expectedLoss, 90);
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
  });
});
