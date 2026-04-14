import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRisk Enrichment", () => {
  it("enriches a BBB-rated loan with maturity > 5 years", async () => {
    const maturityDate = new Date("2035-01-01");
    const input = {
      portfolioId: "port-001",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.05,
      loanAmount: 1_000_000,
      loanId: "loan-001",
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

    // acquisitionDate is set to current time
    assert.ok(result.acquisitionDate instanceof Date);

    // BBB PD = 0.002
    assert.strictEqual(result.probabilityOfDefault, 0.002);

    // BBB risk weight = 0.50, maturity > 5 years → adjusted = 0.50 * 1.15 = 0.575
    // capitalRequirement = 1_000_000 * 0.575 * 0.08 = 46_000
    assert.strictEqual(result.capitalRequirement, 46_000);

    // expectedLoss = 1_000_000 * 0.002 * 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);

    // 0.575 > 0.55, ≤ 1.00 → "Speculative - High"
    assert.strictEqual(result.riskBand, "Speculative - High");

    // Monte Carlo results — type and range checks
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.ok(result.worstCaseLoss >= 0);
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.tailRiskLoss >= 0);

    // Narrative contains key identifiers
    assert.ok(result.riskNarrative.includes("BBB"));
    assert.ok(result.riskNarrative.includes("Speculative - High"));
    assert.strictEqual(typeof result.riskNarrative, "string");
    assert.ok(result.riskNarrative.length > 0);
  });

  it("applies no maturity adjustment for loans ≤ 5 years", async () => {
    const maturityDate = new Date("2028-01-01"); // ~2 years from 2026
    const input = {
      portfolioId: "port-002",
      borrowerName: "Beta Inc",
      creditRating: "A",
      interestRate: 0.04,
      loanAmount: 500_000,
      loanId: "loan-002",
      maturityDate,
    };

    const result = await enrich(input);

    // A PD = 0.0005
    assert.strictEqual(result.probabilityOfDefault, 0.0005);

    // A risk weight = 0.35, no maturity adjustment
    // capitalRequirement = 500_000 * 0.35 * 0.08 = 14_000
    assert.strictEqual(result.capitalRequirement, 14_000);

    // expectedLoss = 500_000 * 0.0005 * 0.45 = 112.5
    assert.strictEqual(result.expectedLoss, 112.5);

    // 0.35 > 0.30, ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");
  });

  it("maps CCC rating to Speculative - Critical band with maturity adjustment", async () => {
    const maturityDate = new Date("2033-01-01"); // > 5 years
    const input = {
      portfolioId: "port-003",
      borrowerName: "Risky LLC",
      creditRating: "CCC",
      interestRate: 0.15,
      loanAmount: 200_000,
      loanId: "loan-003",
      maturityDate,
    };

    const result = await enrich(input);

    // CCC PD = 0.10
    assert.strictEqual(result.probabilityOfDefault, 0.10);

    // CCC risk weight = 1.50, maturity > 5 years → 1.50 * 1.15 = 1.725
    // capitalRequirement = 200_000 * 1.725 * 0.08 = 27_600
    assert.strictEqual(result.capitalRequirement, 27_600);

    // > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");
  });
});
