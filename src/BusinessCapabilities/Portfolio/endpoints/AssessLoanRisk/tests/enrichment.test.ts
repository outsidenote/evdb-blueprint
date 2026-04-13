import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRisk Enrichment", () => {
  it("enriches BBB loan with maturity > 5 years (adjusts risk weight)", async () => {
    const maturityDate = new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000); // 7 years out
    const input = {
      portfolioId: "port-001",
      borrowerName: "Test Corp",
      creditRating: "BBB",
      interestRate: 0.05,
      loanAmount: 1000000,
      loanId: "loan-001",
      maturityDate,
    };

    const result = await enrich(input);

    // Input passthrough
    assert.strictEqual(result.portfolioId, "port-001");
    assert.strictEqual(result.borrowerName, "Test Corp");
    assert.strictEqual(result.creditRating, "BBB");
    assert.strictEqual(result.loanAmount, 1000000);

    // PD for BBB = 0.002
    assert.strictEqual(result.probabilityOfDefault, 0.002);

    // adjustedRiskWeight = 0.50 * 1.15 = 0.575 → Speculative - High
    assert.strictEqual(result.riskBand, "Speculative - High");

    // capitalRequirement = 1000000 * 0.575 * 0.08 = 46000
    assert.ok(Math.abs(result.capitalRequirement - 46000) < 0.01);

    // expectedLoss = 1000000 * 0.002 * 0.45 = 900
    assert.ok(Math.abs(result.expectedLoss - 900) < 0.01);

    // acquisitionDate is set to current time
    assert.ok(result.acquisitionDate instanceof Date);

    // Monte Carlo results are numeric and non-negative
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.ok(result.worstCaseLoss >= 0);
    assert.ok(result.tailRiskLoss >= 0);

    // Narrative contains key fields
    assert.ok(result.riskNarrative.includes("BBB loan ($1000000)"));
    assert.ok(result.riskNarrative.includes("Speculative - High"));
  });

  it("enriches CCC loan (Speculative - Critical, no maturity adjustment needed)", async () => {
    const maturityDate = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000); // 2 years (< 5)
    const input = {
      portfolioId: "port-002",
      borrowerName: "Risky Corp",
      creditRating: "CCC",
      interestRate: 0.15,
      loanAmount: 500000,
      loanId: "loan-002",
      maturityDate,
    };

    const result = await enrich(input);

    // PD for CCC = 0.10
    assert.strictEqual(result.probabilityOfDefault, 0.10);

    // baseRiskWeight = 1.50, maturity ≤ 5 years → no adjustment → Speculative - Critical
    assert.strictEqual(result.riskBand, "Speculative - Critical");

    // capitalRequirement = 500000 * 1.50 * 0.08 = 60000
    assert.ok(Math.abs(result.capitalRequirement - 60000) < 0.01);

    // expectedLoss = 500000 * 0.10 * 0.45 = 22500
    assert.ok(Math.abs(result.expectedLoss - 22500) < 0.01);

    assert.ok(result.riskNarrative.includes("CCC loan ($500000)"));
    assert.ok(result.riskNarrative.includes("Speculative - Critical"));
  });
});
