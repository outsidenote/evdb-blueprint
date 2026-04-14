import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

// 3 years from now — short maturity, no Basel III adjustment
const SHORT_MATURITY = new Date(Date.now() + 3 * 365.25 * 24 * 60 * 60 * 1000);
// 7 years from now — triggers the 1.15 maturity multiplier
const LONG_MATURITY = new Date(Date.now() + 7 * 365.25 * 24 * 60 * 60 * 1000);

describe("AssessLoanRisk Enrichment", () => {
  it("passes through all input fields unchanged", async () => {
    const input = {
      portfolioId: "port-001",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.045,
      loanAmount: 1_000_000,
      loanId: "loan-001",
      maturityDate: SHORT_MATURITY,
    };

    const result = await enrich(input);

    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);
  });

  it("sets acquisitionDate to the current date", async () => {
    const before = new Date();
    const result = await enrich({
      portfolioId: "p",
      borrowerName: "B",
      creditRating: "A",
      interestRate: 0.03,
      loanAmount: 500_000,
      loanId: "l",
      maturityDate: SHORT_MATURITY,
    });
    const after = new Date();

    assert.ok(result.acquisitionDate instanceof Date);
    assert.ok(result.acquisitionDate >= before && result.acquisitionDate <= after);
  });

  it("computes deterministic BBB fields for short maturity (no adjustment)", async () => {
    const result = await enrich({
      portfolioId: "p",
      borrowerName: "B",
      creditRating: "BBB",
      interestRate: 0.05,
      loanAmount: 1_000_000,
      loanId: "l",
      maturityDate: SHORT_MATURITY,
    });

    // PD: 0.002 (0.20%)
    assert.strictEqual(result.probabilityOfDefault, 0.002);
    // capitalRequirement = 1_000_000 * 0.50 * 0.08 = 40_000
    assert.strictEqual(result.capitalRequirement, 40_000);
    // expectedLoss = 1_000_000 * 0.002 * 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);
    // riskBand: 0.50 <= 0.55
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");
  });

  it("applies 1.15 maturity multiplier for BBB with maturity > 5 years", async () => {
    const result = await enrich({
      portfolioId: "p",
      borrowerName: "B",
      creditRating: "BBB",
      interestRate: 0.05,
      loanAmount: 1_000_000,
      loanId: "l",
      maturityDate: LONG_MATURITY,
    });

    // adjustedRiskWeight = 0.50 * 1.15 = 0.575
    // capitalRequirement = 1_000_000 * 0.575 * 0.08 = 46_000
    assert.strictEqual(result.capitalRequirement, 46_000);
    // 0.575 > 0.55 → "Speculative - High"
    assert.strictEqual(result.riskBand, "Speculative - High");
  });

  it("assigns correct riskBand for each rating tier", async () => {
    const cases: [string, string][] = [
      ["AAA", "Investment Grade - Low"],   // 0.20 <= 0.30
      ["AA", "Investment Grade - Low"],    // 0.25 <= 0.30
      ["A", "Investment Grade - Medium"],  // 0.35 <= 0.55
      ["BBB", "Investment Grade - Medium"],// 0.50 <= 0.55
      ["BB", "Speculative - High"],        // 0.75 <= 1.00
      ["B", "Speculative - High"],         // 1.00 <= 1.00
      ["CCC", "Speculative - Critical"],   // 1.50 > 1.00
    ];

    for (const [rating, expectedBand] of cases) {
      const result = await enrich({
        portfolioId: "p",
        borrowerName: "B",
        creditRating: rating,
        interestRate: 0.05,
        loanAmount: 100_000,
        loanId: "l",
        maturityDate: SHORT_MATURITY,
      });
      assert.strictEqual(result.riskBand, expectedBand, `riskBand for ${rating}`);
    }
  });

  it("returns numeric simulation fields within valid ranges", async () => {
    const result = await enrich({
      portfolioId: "p",
      borrowerName: "B",
      creditRating: "BB",
      interestRate: 0.07,
      loanAmount: 2_000_000,
      loanId: "l",
      maturityDate: SHORT_MATURITY,
    });

    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.ok(result.worstCaseLoss >= 0);
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss || result.tailRiskLoss >= 0);
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.strictEqual(typeof result.tailRiskLoss, "number");
  });

  it("builds a riskNarrative containing key identifiers", async () => {
    const result = await enrich({
      portfolioId: "p",
      borrowerName: "B",
      creditRating: "A",
      interestRate: 0.04,
      loanAmount: 500_000,
      loanId: "l",
      maturityDate: SHORT_MATURITY,
    });

    assert.ok(result.riskNarrative.includes("A loan ($500000)"), `narrative: ${result.riskNarrative}`);
    assert.ok(result.riskNarrative.includes("Investment Grade"), `narrative: ${result.riskNarrative}`);
    assert.ok(result.riskNarrative.includes("Simulated default rate:"), `narrative: ${result.riskNarrative}`);
    assert.ok(result.riskNarrative.includes("VaR(95%):"), `narrative: ${result.riskNarrative}`);
    assert.ok(result.riskNarrative.includes("Tail risk:"), `narrative: ${result.riskNarrative}`);
  });
});
