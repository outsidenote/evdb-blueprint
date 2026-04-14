import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

const futureDate = (yearsFromNow: number): Date => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + yearsFromNow);
  return d;
};

describe("AssessLoanRiskProcessor Enrichment", () => {
  it("enriches BBB loan with short maturity as Investment Grade - Medium", async () => {
    const input = {
      portfolioId: "p1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 4.5,
      loanAmount: 1000000,
      loanId: "loan-001",
      maturityDate: futureDate(3),
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

    // Deterministic computed fields
    assert.strictEqual(result.probabilityOfDefault, 0.002);
    assert.strictEqual(result.capitalRequirement, 40000);   // 1000000 * 0.50 * 0.08
    assert.strictEqual(result.expectedLoss, 900);            // 1000000 * 0.002 * 0.45
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");
    assert.ok(result.acquisitionDate instanceof Date);

    // Stochastic Monte Carlo fields — check type, range, and narrative
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.ok(result.worstCaseLoss >= 0);
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss || result.tailRiskLoss >= 0);
    assert.ok(result.riskNarrative.includes("BBB"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
    assert.ok(result.riskNarrative.includes("VaR(95%)"));
    assert.ok(result.riskNarrative.includes("Tail risk"));
  });

  it("applies maturity adjustment and raises risk band for BBB loan with maturity > 5 years", async () => {
    const input = {
      portfolioId: "p2",
      borrowerName: "Beta Inc",
      creditRating: "BBB",
      interestRate: 5.0,
      loanAmount: 1000000,
      loanId: "loan-002",
      maturityDate: futureDate(7),
    };

    const result = await enrich(input);

    // adjustedRiskWeight = 0.50 * 1.15 = 0.575 → crosses into Speculative - High
    assert.strictEqual(result.capitalRequirement, 46000);   // 1000000 * 0.575 * 0.08
    assert.strictEqual(result.riskBand, "Speculative - High");
  });

  it("maps AAA rating to Investment Grade - Low with correct PD and capital", async () => {
    const input = {
      portfolioId: "p3",
      borrowerName: "Top Corp",
      creditRating: "AAA",
      interestRate: 2.0,
      loanAmount: 500000,
      loanId: "loan-003",
      maturityDate: futureDate(2),
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.0001);
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
    assert.strictEqual(result.capitalRequirement, 8000);    // 500000 * 0.20 * 0.08
    assert.strictEqual(result.expectedLoss, 2.25);          // 500000 * 0.0001 * 0.45
  });

  it("maps CCC rating to Speculative - Critical with correct PD and capital", async () => {
    const input = {
      portfolioId: "p4",
      borrowerName: "Risky Corp",
      creditRating: "CCC",
      interestRate: 12.0,
      loanAmount: 1000000,
      loanId: "loan-004",
      maturityDate: futureDate(3),
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.10);
    assert.strictEqual(result.riskBand, "Speculative - Critical");
    assert.strictEqual(result.capitalRequirement, 120000);  // 1000000 * 1.50 * 0.08
    assert.strictEqual(result.expectedLoss, 45000);         // 1000000 * 0.10 * 0.45
    // CCC has high PD so simulation should show non-trivial default rate
    assert.ok(result.simulatedDefaultRate > 0);
  });

  it("applies long-maturity adjustment to CCC pushing capital higher", async () => {
    const input = {
      portfolioId: "p5",
      borrowerName: "Risky Long Corp",
      creditRating: "CCC",
      interestRate: 14.0,
      loanAmount: 1000000,
      loanId: "loan-005",
      maturityDate: futureDate(8),
    };

    const result = await enrich(input);

    // adjustedRiskWeight = 1.50 * 1.15 = 1.725
    assert.strictEqual(result.capitalRequirement, 138000);  // 1000000 * 1.725 * 0.08
    assert.strictEqual(result.riskBand, "Speculative - Critical");
  });

  it("populates riskNarrative with all required sections", async () => {
    const input = {
      portfolioId: "p6",
      borrowerName: "Narrative Corp",
      creditRating: "BB",
      interestRate: 7.0,
      loanAmount: 2000000,
      loanId: "loan-006",
      maturityDate: futureDate(4),
    };

    const result = await enrich(input);

    assert.ok(result.riskNarrative.startsWith("BB loan ($2000000):"));
    assert.ok(result.riskNarrative.includes("Simulated default rate:"));
    assert.ok(result.riskNarrative.includes("Expected loss:"));
    assert.ok(result.riskNarrative.includes("VaR(95%):"));
    assert.ok(result.riskNarrative.includes("Tail risk:"));
  });
});
