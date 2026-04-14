import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRisk Enrichment", () => {
  it("enriches BBB loan with short maturity (< 5 years) — no maturity adjustment", async () => {
    const maturityDate = new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000); // 3 years out
    const input = {
      portfolioId: "p-001",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.045,
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

    // Deterministic fields
    assert.ok(result.acquisitionDate instanceof Date);
    assert.strictEqual(result.probabilityOfDefault, 0.002); // BBB → 0.20%
    // capitalRequirement = 1_000_000 × 0.50 × 0.08 = 40_000 (no maturity adj)
    assert.ok(Math.abs(result.capitalRequirement - 40_000) < 0.01);
    // expectedLoss = 1_000_000 × 0.002 × 0.45 = 900
    assert.ok(Math.abs(result.expectedLoss - 900) < 0.01);
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Narrative contains key labels
    assert.ok(result.riskNarrative.includes("BBB"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
    assert.ok(result.riskNarrative.includes("VaR(95%)"));
    assert.ok(result.riskNarrative.includes("Tail risk"));

    // Monte Carlo results: correct types and non-negative values
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.ok(result.worstCaseLoss >= 0);
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss); // CVaR >= VaR
  });

  it("applies maturity adjustment for loans > 5 years", async () => {
    const maturityDate = new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000); // 7 years out
    const input = {
      portfolioId: "p-002",
      borrowerName: "Beta Inc",
      creditRating: "A",
      interestRate: 0.03,
      loanAmount: 500_000,
      loanId: "loan-002",
      maturityDate,
    };

    const result = await enrich(input);

    // A rating: baseRiskWeight 0.35, adjusted = 0.35 × 1.15 = 0.4025
    // capitalRequirement = 500_000 × 0.4025 × 0.08 = 16_100
    assert.ok(Math.abs(result.capitalRequirement - 16_100) < 0.01);
    // 0.4025 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");
    assert.strictEqual(result.probabilityOfDefault, 0.0005); // A → 0.05%
  });

  it("assigns correct risk bands for all credit ratings", async () => {
    const shortMaturity = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);
    const base = { portfolioId: "p", borrowerName: "X", interestRate: 0, loanAmount: 100, loanId: "l", maturityDate: shortMaturity };

    const cases: Array<{ creditRating: string; expectedBand: string }> = [
      { creditRating: "AAA", expectedBand: "Investment Grade - Low" },   // 0.20 ≤ 0.30
      { creditRating: "AA",  expectedBand: "Investment Grade - Low" },   // 0.25 ≤ 0.30
      { creditRating: "A",   expectedBand: "Investment Grade - Medium" }, // 0.35 ≤ 0.55
      { creditRating: "BBB", expectedBand: "Investment Grade - Medium" }, // 0.50 ≤ 0.55
      { creditRating: "BB",  expectedBand: "Speculative - High" },        // 0.75 ≤ 1.00
      { creditRating: "B",   expectedBand: "Speculative - High" },        // 1.00 ≤ 1.00
      { creditRating: "CCC", expectedBand: "Speculative - Critical" },    // 1.50 > 1.00
    ];

    for (const { creditRating, expectedBand } of cases) {
      const result = await enrich({ ...base, creditRating });
      assert.strictEqual(result.riskBand, expectedBand, `Expected ${expectedBand} for ${creditRating}`);
    }
  });
});
