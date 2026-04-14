import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

function yearsFromNow(years: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d;
}

describe("AssessLoanRisk Enrichment", () => {
  it("enriches BBB-rated loan within 5yr maturity with correct deterministic fields", async () => {
    const maturityDate = yearsFromNow(3);

    const input = {
      portfolioId: "portfolio-1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 5.5,
      loanAmount: 1_000_000,
      loanId: "loan-001",
      maturityDate,
    };

    const result = await enrich(input);

    // Input fields pass through unchanged
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // acquisitionDate is a fresh Date
    assert.ok(result.acquisitionDate instanceof Date);

    // BBB: PD = 0.002, riskWeight = 0.50 (no maturity adjustment, 3yr < 5yr)
    assert.strictEqual(result.probabilityOfDefault, 0.002);
    assert.strictEqual(result.capitalRequirement, 1_000_000 * 0.50 * 0.08); // 40000
    assert.strictEqual(result.expectedLoss, 1_000_000 * 0.002 * 0.45);     // 900
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Stochastic fields: correct type and non-negative
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.ok(result.worstCaseLoss >= 0);
    assert.ok(result.tailRiskLoss >= 0);

    // Narrative contains key identifiers
    assert.ok(result.riskNarrative.includes("BBB"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
    assert.ok(result.riskNarrative.length > 0);
  });

  it("applies 1.15x maturity adjustment for loans over 5 years", async () => {
    const input = {
      portfolioId: "portfolio-2",
      borrowerName: "Beta Inc",
      creditRating: "BBB",
      interestRate: 6.0,
      loanAmount: 500_000,
      loanId: "loan-002",
      maturityDate: yearsFromNow(6),
    };

    const result = await enrich(input);

    // BBB base risk weight 0.50 × 1.15 = 0.575
    const adjustedRiskWeight = 0.50 * 1.15;
    assert.strictEqual(result.capitalRequirement, 500_000 * adjustedRiskWeight * 0.08);
    // 0.575 > 0.55 → Speculative - High
    assert.strictEqual(result.riskBand, "Speculative - High");
  });

  it("maps AAA rating to Investment Grade - Low with correct PD and capital", async () => {
    const input = {
      portfolioId: "portfolio-3",
      borrowerName: "Prime Corp",
      creditRating: "AAA",
      interestRate: 3.0,
      loanAmount: 2_000_000,
      loanId: "loan-003",
      maturityDate: yearsFromNow(2),
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.0001);
    assert.strictEqual(result.capitalRequirement, 2_000_000 * 0.20 * 0.08); // 32000
    assert.strictEqual(result.expectedLoss, 2_000_000 * 0.0001 * 0.45);    // 90
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
  });

  it("maps CCC rating to Speculative - Critical with correct PD and capital", async () => {
    const input = {
      portfolioId: "portfolio-4",
      borrowerName: "Risky LLC",
      creditRating: "CCC",
      interestRate: 15.0,
      loanAmount: 100_000,
      loanId: "loan-004",
      maturityDate: yearsFromNow(2),
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.10);
    assert.strictEqual(result.capitalRequirement, 100_000 * 1.50 * 0.08); // 12000
    assert.strictEqual(result.expectedLoss, 100_000 * 0.10 * 0.45);       // 4500
    assert.strictEqual(result.riskBand, "Speculative - Critical");
    assert.ok(result.riskNarrative.includes("CCC"));
    assert.ok(result.riskNarrative.includes("Speculative - Critical"));
  });

  it("maps B rating to Speculative - High", async () => {
    const input = {
      portfolioId: "portfolio-5",
      borrowerName: "Marginal Corp",
      creditRating: "B",
      interestRate: 10.0,
      loanAmount: 250_000,
      loanId: "loan-005",
      maturityDate: yearsFromNow(3),
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.03);
    // B risk weight = 1.00 → Speculative - High
    assert.strictEqual(result.capitalRequirement, 250_000 * 1.00 * 0.08); // 20000
    assert.strictEqual(result.riskBand, "Speculative - High");
  });
});
