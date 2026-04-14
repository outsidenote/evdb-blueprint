import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

function futureDate(years: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d;
}

describe("AssessLoanRisk Enrichment", () => {
  it("enriches BBB loan (< 5 yr maturity) with correct deterministic fields", async () => {
    const maturityDate = futureDate(3);
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

    // Pass-through fields
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // acquisitionDate is today
    assert.ok(result.acquisitionDate instanceof Date);

    // BBB: PD = 0.002, base risk weight = 0.50, no maturity adjustment (3 yr < 5 yr)
    assert.strictEqual(result.probabilityOfDefault, 0.002);
    // capitalRequirement = 1_000_000 × 0.50 × 0.08 = 40_000
    assert.strictEqual(result.capitalRequirement, 40_000);
    // expectedLoss = 1_000_000 × 0.002 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);
    // adjustedRiskWeight = 0.50 → ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Stochastic fields — types and plausible ranges
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.ok(result.worstCaseLoss >= 0);
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss);

    // Narrative includes key identifiers
    assert.ok(result.riskNarrative.includes("BBB"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
  });

  it("applies maturity adjustment for AA loan > 5 years", async () => {
    const input = {
      portfolioId: "portfolio-2",
      borrowerName: "BigCo",
      creditRating: "AA",
      interestRate: 0.03,
      loanAmount: 500_000,
      loanId: "loan-2",
      maturityDate: futureDate(7),
    };

    const result = await enrich(input);

    // AA: PD = 0.0002, base risk weight = 0.25, × 1.15 = 0.2875 (maturity 7 yr > 5 yr)
    assert.strictEqual(result.probabilityOfDefault, 0.0002);
    // adjustedRiskWeight = 0.2875 ≤ 0.30 → "Investment Grade - Low"
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
    // capitalRequirement = 500_000 × 0.2875 × 0.08 = 11_500
    assert.strictEqual(result.capitalRequirement, 11_500);
    // expectedLoss = 500_000 × 0.0002 × 0.45 = 45
    assert.strictEqual(result.expectedLoss, 45);
  });

  it("handles CCC rating with Speculative - Critical risk band", async () => {
    const input = {
      portfolioId: "portfolio-3",
      borrowerName: "RiskyCo",
      creditRating: "CCC",
      interestRate: 0.12,
      loanAmount: 200_000,
      loanId: "loan-3",
      maturityDate: futureDate(2),
    };

    const result = await enrich(input);

    // CCC: PD = 0.10, base risk weight = 1.50, no maturity adjustment (2 yr < 5 yr)
    assert.strictEqual(result.probabilityOfDefault, 0.10);
    // adjustedRiskWeight = 1.50 > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");
    // capitalRequirement = 200_000 × 1.50 × 0.08 = 24_000
    assert.strictEqual(result.capitalRequirement, 24_000);
    // expectedLoss = 200_000 × 0.10 × 0.45 = 9_000
    assert.strictEqual(result.expectedLoss, 9_000);

    assert.ok(result.riskNarrative.includes("CCC"));
    assert.ok(result.riskNarrative.includes("Speculative - Critical"));
  });

  it("handles B rating (> 5 yr) with Speculative - Critical band after adjustment", async () => {
    const input = {
      portfolioId: "portfolio-4",
      borrowerName: "JunkCo",
      creditRating: "B",
      interestRate: 0.08,
      loanAmount: 300_000,
      loanId: "loan-4",
      maturityDate: futureDate(6),
    };

    const result = await enrich(input);

    // B: base risk weight = 1.00, × 1.15 = 1.15 (maturity 6 yr > 5 yr)
    assert.strictEqual(result.probabilityOfDefault, 0.03);
    // adjustedRiskWeight = 1.15 > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");
    // capitalRequirement = 300_000 × 1.15 × 0.08 = 27_600
    assert.strictEqual(result.capitalRequirement, 27_600);
  });
});
