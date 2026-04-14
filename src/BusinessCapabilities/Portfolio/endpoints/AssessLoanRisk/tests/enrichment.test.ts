import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRisk Enrichment", () => {
  it("enriches input with computed fields", async () => {
    // BBB loan with 7-year maturity triggers maturity adjustment (> 5 years)
    const maturityDate = new Date(Date.now() + 7 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "portfolio-1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.045,
      loanAmount: 1_000_000,
      loanId: "loan-1",
      maturityDate,
    };

    const result = await enrich(input);

    // Verify input fields are passed through
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // acquisitionDate is today
    assert.ok(result.acquisitionDate instanceof Date);

    // Deterministic fields (BBB, 7-year maturity):
    //   baseRiskWeight = 0.50, adjustedRiskWeight = 0.50 * 1.15 = 0.575
    //   capitalRequirement = 1_000_000 * 0.575 * 0.08 = 46_000
    //   expectedLoss = 1_000_000 * 0.0020 * 0.45 = 900
    //   probabilityOfDefault = 0.0020
    //   riskBand: 0.575 > 0.55 and ≤ 1.00 → "Speculative - High"
    assert.strictEqual(result.probabilityOfDefault, 0.0020);
    assert.strictEqual(result.capitalRequirement, 46_000);
    assert.strictEqual(result.expectedLoss, 900);
    assert.strictEqual(result.riskBand, "Speculative - High");

    // Monte Carlo results are random — verify types and plausible ranges
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.ok(result.worstCaseLoss >= 0);
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.tailRiskLoss >= 0);

    // Narrative includes key identifiers
    assert.strictEqual(typeof result.riskNarrative, "string");
    assert.ok(result.riskNarrative.startsWith("BBB loan ($1000000):"));
    assert.ok(result.riskNarrative.includes("Speculative - High"));
  });

  it("applies maturity adjustment only when maturity exceeds 5 years", async () => {
    const shortMaturity = new Date(Date.now() + 3 * 365.25 * 24 * 60 * 60 * 1000);
    const longMaturity = new Date(Date.now() + 7 * 365.25 * 24 * 60 * 60 * 1000);
    const base = {
      portfolioId: "p1",
      borrowerName: "Corp A",
      creditRating: "BBB",
      interestRate: 0.05,
      loanAmount: 1_000_000,
      loanId: "l1",
    };

    const short = await enrich({ ...base, maturityDate: shortMaturity });
    const long = await enrich({ ...base, maturityDate: longMaturity });

    // Short: capitalRequirement = 1_000_000 * 0.50 * 0.08 = 40_000
    assert.strictEqual(short.capitalRequirement, 40_000);
    assert.strictEqual(short.riskBand, "Investment Grade - Medium");

    // Long: capitalRequirement = 1_000_000 * 0.575 * 0.08 = 46_000
    assert.strictEqual(long.capitalRequirement, 46_000);
    assert.strictEqual(long.riskBand, "Speculative - High");
  });

  it("classifies risk bands correctly across all credit ratings", async () => {
    const maturityDate = new Date(Date.now() + 2 * 365.25 * 24 * 60 * 60 * 1000);
    const base = { portfolioId: "p", borrowerName: "B", interestRate: 0.05, loanAmount: 100, loanId: "l", maturityDate };

    const cases: Array<[string, string]> = [
      ["AAA", "Investment Grade - Low"],   // 0.20 ≤ 0.30
      ["AA", "Investment Grade - Low"],    // 0.25 ≤ 0.30
      ["A", "Investment Grade - Medium"],  // 0.35 ≤ 0.55
      ["BBB", "Investment Grade - Medium"],// 0.50 ≤ 0.55
      ["BB", "Speculative - High"],        // 0.75 ≤ 1.00
      ["B", "Speculative - High"],         // 1.00 ≤ 1.00
      ["CCC", "Speculative - Critical"],   // 1.50 > 1.00
    ];

    for (const [rating, expectedBand] of cases) {
      const result = await enrich({ ...base, creditRating: rating });
      assert.strictEqual(result.riskBand, expectedBand, `rating ${rating} should be ${expectedBand}`);
    }
  });
});
