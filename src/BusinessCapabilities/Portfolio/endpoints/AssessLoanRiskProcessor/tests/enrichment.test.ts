import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRiskProcessor Enrichment", () => {
  it("enriches BBB-rated loan with correct deterministic fields", async () => {
    const input = {
      portfolioId: "portfolio-1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 4.5,
      loanAmount: 1000000,
      loanId: "loan-123",
      maturityDate: new Date("2028-01-01"), // ~1.7 years from 2026, no maturity adjustment
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

    // acquisitionDate is set to now
    assert.ok(result.acquisitionDate instanceof Date);

    // BBB: PD=0.002, riskWeight=0.50, capitalReq = 1_000_000 * 0.50 * 0.08 = 40_000
    assert.strictEqual(result.probabilityOfDefault, 0.002);
    assert.strictEqual(result.capitalRequirement, 40000);
    // expectedLoss = 1_000_000 * 0.002 * 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Monte Carlo results — non-deterministic, verify type and range
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.ok(result.worstCaseLoss >= 0);
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss); // CVaR >= VaR

    // Narrative contains key identifiers
    assert.strictEqual(typeof result.riskNarrative, "string");
    assert.ok(result.riskNarrative.includes("BBB"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
    assert.ok(result.riskNarrative.includes("VaR(95%)"));
    assert.ok(result.riskNarrative.includes("Tail risk"));
  });

  it("applies maturity adjustment for loans with remaining maturity > 5 years", async () => {
    const input = {
      portfolioId: "portfolio-2",
      borrowerName: "Beta LLC",
      creditRating: "A",
      interestRate: 3.5,
      loanAmount: 500000,
      loanId: "loan-456",
      maturityDate: new Date("2035-01-01"), // ~8.7 years from 2026, triggers 1.15x adjustment
    };

    const result = await enrich(input);

    // A: baseRiskWeight=0.35, adjustedRiskWeight = 0.35 * 1.15 = 0.4025
    // capitalRequirement = 500_000 * 0.4025 * 0.08 = 16_100
    assert.strictEqual(result.capitalRequirement, 16100);
    // 0.4025 <= 0.55 → Investment Grade - Medium
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");
  });

  it("does not apply maturity adjustment for short-dated loans", async () => {
    const input = {
      portfolioId: "portfolio-3",
      borrowerName: "Gamma Inc",
      creditRating: "BB",
      interestRate: 6.0,
      loanAmount: 200000,
      loanId: "loan-789",
      maturityDate: new Date("2028-06-01"), // ~2.1 years, no adjustment
    };

    const result = await enrich(input);

    // BB: riskWeight=0.75, no adjustment → capitalReq = 200_000 * 0.75 * 0.08 = 12_000
    assert.strictEqual(result.capitalRequirement, 12000);
    assert.strictEqual(result.riskBand, "Speculative - High");
  });

  it("assigns correct risk bands for all credit ratings", async () => {
    const cases: Array<[string, string]> = [
      ["AAA", "Investment Grade - Low"],    // 0.20 <= 0.30
      ["AA",  "Investment Grade - Low"],    // 0.25 <= 0.30
      ["A",   "Investment Grade - Medium"], // 0.35 <= 0.55
      ["BBB", "Investment Grade - Medium"], // 0.50 <= 0.55
      ["BB",  "Speculative - High"],        // 0.75 <= 1.00
      ["B",   "Speculative - High"],        // 1.00 <= 1.00
      ["CCC", "Speculative - Critical"],    // 1.50 > 1.00
    ];

    for (const [rating, expectedBand] of cases) {
      const result = await enrich({
        portfolioId: "p",
        borrowerName: "test",
        creditRating: rating,
        interestRate: 5,
        loanAmount: 100000,
        loanId: "l",
        maturityDate: new Date("2028-01-01"), // short maturity, no adjustment
      });
      assert.strictEqual(result.riskBand, expectedBand, `${rating} should map to ${expectedBand}`);
    }
  });

  it("computes correct PD and expected loss for CCC-rated loan", async () => {
    const input = {
      portfolioId: "portfolio-4",
      borrowerName: "Risky Corp",
      creditRating: "CCC",
      interestRate: 12.0,
      loanAmount: 100000,
      loanId: "loan-ccc",
      maturityDate: new Date("2028-01-01"),
    };

    const result = await enrich(input);

    // CCC: PD=0.10, expectedLoss = 100_000 * 0.10 * 0.45 = 4_500
    assert.strictEqual(result.probabilityOfDefault, 0.10);
    assert.strictEqual(result.expectedLoss, 4500);
    assert.strictEqual(result.riskBand, "Speculative - Critical");
  });
});
