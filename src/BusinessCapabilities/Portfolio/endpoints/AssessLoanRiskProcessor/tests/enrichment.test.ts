import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRiskProcessor Enrichment", () => {
  it("enriches BBB-rated loan with correct deterministic risk metrics", async () => {
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 3); // 3 years — no maturity adjustment

    const input = {
      portfolioId: "portfolio-1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 5.5,
      loanAmount: 1000000,
      loanId: "loan-001",
      maturityDate,
    };

    const result = await enrich(input);

    // Input fields passed through
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    assert.ok(result.acquisitionDate instanceof Date);

    // BBB: PD=0.002, baseRiskWeight=0.50 (no maturity adj), capitalReq=1000000*0.50*0.08=40000
    assert.strictEqual(result.probabilityOfDefault, 0.002);
    assert.strictEqual(result.capitalRequirement, 40000);
    // expectedLoss = 1000000 * 0.002 * 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);
    // adjustedRiskWeight 0.50 ≤ 0.55 → Investment Grade - Medium
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Simulation-based (non-deterministic): verify types and plausible ranges
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0);
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.strictEqual(typeof result.tailRiskLoss, "number");

    // Narrative contains key identifiers
    assert.ok(result.riskNarrative.includes("BBB"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
  });

  it("applies 1.15x maturity adjustment for loans > 5 years", async () => {
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 7); // 7 years — triggers adjustment

    const input = {
      portfolioId: "portfolio-2",
      borrowerName: "Beta Corp",
      creditRating: "BBB",
      interestRate: 6.0,
      loanAmount: 1000000,
      loanId: "loan-002",
      maturityDate,
    };

    const result = await enrich(input);

    // BBB base risk weight 0.50 * 1.15 = 0.575
    // capitalRequirement = 1000000 * 0.575 * 0.08 = 46000
    assert.strictEqual(result.capitalRequirement, 46000);
    // adjustedRiskWeight 0.575 > 0.55 → Speculative - High
    assert.strictEqual(result.riskBand, "Speculative - High");
  });

  it("maps AAA rating to lowest risk band and metrics", async () => {
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 2);

    const input = {
      portfolioId: "portfolio-3",
      borrowerName: "AAA Corp",
      creditRating: "AAA",
      interestRate: 2.0,
      loanAmount: 500000,
      loanId: "loan-003",
      maturityDate,
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.0001);
    // 500000 * 0.20 * 0.08 = 8000
    assert.strictEqual(result.capitalRequirement, 8000);
    // 500000 * 0.0001 * 0.45 = 22.5
    assert.strictEqual(result.expectedLoss, 22.5);
    // adjustedRiskWeight 0.20 ≤ 0.30 → Investment Grade - Low
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
  });

  it("maps CCC rating to highest risk band", async () => {
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + 2);

    const input = {
      portfolioId: "portfolio-4",
      borrowerName: "Junk Corp",
      creditRating: "CCC",
      interestRate: 15.0,
      loanAmount: 200000,
      loanId: "loan-004",
      maturityDate,
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.10);
    // 200000 * 1.50 * 0.08 = 24000
    assert.strictEqual(result.capitalRequirement, 24000);
    // adjustedRiskWeight 1.50 > 1.00 → Speculative - Critical
    assert.strictEqual(result.riskBand, "Speculative - Critical");
    assert.ok(result.riskNarrative.includes("Speculative - Critical"));
  });
});
