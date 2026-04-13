import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRisk Enrichment", () => {
  it("computes correct deterministic fields for BBB loan with long maturity", async () => {
    // 7-year maturity triggers the >5yr maturity adjustment (×1.15)
    const maturityDate = new Date(Date.now() + 7 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "PORT-001",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 5,
      loanAmount: 1000000,
      loanId: "LOAN-001",
      maturityDate,
    };

    const result = await enrich(input);

    // Input fields pass through
    assert.strictEqual(result.portfolioId, "PORT-001");
    assert.strictEqual(result.borrowerName, "Acme Corp");
    assert.strictEqual(result.creditRating, "BBB");
    assert.strictEqual(result.loanAmount, 1000000);

    // acquisitionDate is set to now
    assert.ok(result.acquisitionDate instanceof Date);

    // BBB PD = 0.20% = 0.002
    assert.strictEqual(result.probabilityOfDefault, 0.002);

    // adjustedRiskWeight = 0.50 × 1.15 = 0.575 (maturity > 5yr)
    // capitalRequirement = 1000000 × 0.575 × 0.08 = 46000
    assert.strictEqual(result.capitalRequirement, 46000);

    // expectedLoss = 1000000 × 0.002 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);

    // 0.575 > 0.55 and ≤ 1.00 → Speculative - High
    assert.strictEqual(result.riskBand, "Speculative - High");

    // Monte Carlo results are stochastic — verify shape
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.strictEqual(typeof result.tailRiskLoss, "number");

    // Narrative contains key identifying fields
    assert.ok(result.riskNarrative.startsWith("BBB loan ($1000000):"));
    assert.ok(result.riskNarrative.includes("Speculative - High"));
  });

  it("computes correct fields for CCC loan without maturity adjustment (short maturity)", async () => {
    // 3-year maturity: no adjustment (≤ 5yr)
    const maturityDate = new Date(Date.now() + 3 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "PORT-002",
      borrowerName: "Risky Corp",
      creditRating: "CCC",
      interestRate: 12,
      loanAmount: 1000000,
      loanId: "LOAN-002",
      maturityDate,
    };

    const result = await enrich(input);

    // CCC PD = 10% = 0.10
    assert.strictEqual(result.probabilityOfDefault, 0.10);

    // adjustedRiskWeight = 1.50 (no maturity adj), capitalRequirement = 1000000 × 1.50 × 0.08 = 120000
    assert.strictEqual(result.capitalRequirement, 120000);

    // expectedLoss = 1000000 × 0.10 × 0.45 = 45000
    assert.strictEqual(result.expectedLoss, 45000);

    // 1.50 > 1.00 → Speculative - Critical
    assert.strictEqual(result.riskBand, "Speculative - Critical");

    assert.ok(result.riskNarrative.includes("Speculative - Critical"));
  });

  it("computes Investment Grade - Low for AAA loan", async () => {
    const maturityDate = new Date(Date.now() + 2 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "PORT-003",
      borrowerName: "Blue Chip Corp",
      creditRating: "AAA",
      interestRate: 2,
      loanAmount: 5000000,
      loanId: "LOAN-003",
      maturityDate,
    };

    const result = await enrich(input);

    // AAA PD = 0.01% = 0.0001
    assert.strictEqual(result.probabilityOfDefault, 0.0001);

    // adjustedRiskWeight = 0.20 (no maturity adj), capitalRequirement = 5000000 × 0.20 × 0.08 = 80000
    assert.strictEqual(result.capitalRequirement, 80000);

    // 0.20 ≤ 0.30 → Investment Grade - Low
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
  });
});
