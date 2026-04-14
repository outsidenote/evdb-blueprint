import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRiskProcessor Enrichment", () => {
  it("computes correct risk metrics for a BBB loan with short maturity (< 5 years)", async () => {
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 2);

    const input = {
      portfolioId: "portfolio-1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.05,
      loanAmount: 1000000,
      loanId: "loan-1",
      maturityDate,
    };

    const result = await enrich(input);

    // Input pass-through
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // Deterministic fields
    assert.ok(result.acquisitionDate instanceof Date);
    assert.strictEqual(result.probabilityOfDefault, 0.002);
    // capitalRequirement: 1000000 * 0.50 * 0.08 = 40000
    assert.strictEqual(result.capitalRequirement, 40000);
    // expectedLoss: 1000000 * 0.002 * 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);
    // adjustedRiskWeight = 0.50 (no maturity adjustment) → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Monte Carlo — verify reasonable ranges
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 0.05,
      `simulatedDefaultRate out of range: ${result.simulatedDefaultRate}`);
    assert.ok(result.expectedPortfolioLoss >= 0, "expectedPortfolioLoss should be non-negative");
    assert.ok(result.worstCaseLoss >= 0, "worstCaseLoss should be non-negative");
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss, "CVaR should be >= VaR");

    // Narrative content
    assert.ok(result.riskNarrative.includes("BBB"), "narrative should include credit rating");
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"), "narrative should include risk band");
    assert.ok(result.riskNarrative.includes("VaR(95%)"), "narrative should include VaR label");
  });

  it("applies maturity adjustment for loans with maturity > 5 years", async () => {
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 7);

    const input = {
      portfolioId: "portfolio-2",
      borrowerName: "Beta Inc",
      creditRating: "BBB",
      interestRate: 0.06,
      loanAmount: 1000000,
      loanId: "loan-2",
      maturityDate,
    };

    const result = await enrich(input);

    // adjustedRiskWeight = 0.50 * 1.15 = 0.575 → capitalRequirement = 1000000 * 0.575 * 0.08 = 46000
    assert.strictEqual(result.capitalRequirement, 46000);
    // 0.575 > 0.55 and ≤ 1.00 → "Speculative - High"
    assert.strictEqual(result.riskBand, "Speculative - High");
  });

  it("computes correct values for AAA rated loan", async () => {
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 3);

    const input = {
      portfolioId: "portfolio-3",
      borrowerName: "Triple A Corp",
      creditRating: "AAA",
      interestRate: 0.03,
      loanAmount: 1000000,
      loanId: "loan-3",
      maturityDate,
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.0001);
    // capitalRequirement: 1000000 * 0.20 * 0.08 = 16000
    assert.strictEqual(result.capitalRequirement, 16000);
    // expectedLoss: 1000000 * 0.0001 * 0.45 = 45
    assert.strictEqual(result.expectedLoss, 45);
    // adjustedRiskWeight = 0.20 ≤ 0.30 → "Investment Grade - Low"
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
  });

  it("computes correct values for CCC rated loan with long maturity", async () => {
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 8);

    const input = {
      portfolioId: "portfolio-4",
      borrowerName: "Junk Bond LLC",
      creditRating: "CCC",
      interestRate: 0.15,
      loanAmount: 500000,
      loanId: "loan-4",
      maturityDate,
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.10);
    // adjustedRiskWeight = 1.50 * 1.15 = 1.725 → capitalRequirement = 500000 * 1.725 * 0.08 = 69000
    assert.strictEqual(result.capitalRequirement, 69000);
    // expectedLoss: 500000 * 0.10 * 0.45 = 22500
    assert.strictEqual(result.expectedLoss, 22500);
    // adjustedRiskWeight = 1.725 > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");

    // High-PD loan: simulatedDefaultRate should be roughly near 0.10
    assert.ok(result.simulatedDefaultRate >= 0.05 && result.simulatedDefaultRate <= 0.20,
      `simulatedDefaultRate out of expected range for CCC: ${result.simulatedDefaultRate}`);
    // CVaR ≥ VaR
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss, "CVaR should be >= VaR");
  });

  it("populates riskNarrative with all required components", async () => {
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 3);

    const input = {
      portfolioId: "portfolio-5",
      borrowerName: "Sample Co",
      creditRating: "BB",
      interestRate: 0.08,
      loanAmount: 250000,
      loanId: "loan-5",
      maturityDate,
    };

    const result = await enrich(input);

    assert.ok(result.riskNarrative.startsWith("BB loan ($250000)"), "narrative should start with rating and amount");
    assert.ok(result.riskNarrative.includes("Simulated default rate:"), "narrative should include default rate label");
    assert.ok(result.riskNarrative.includes("Expected loss:"), "narrative should include expected loss label");
    assert.ok(result.riskNarrative.includes("VaR(95%):"), "narrative should include VaR label");
    assert.ok(result.riskNarrative.includes("Tail risk:"), "narrative should include tail risk label");
  });
});
