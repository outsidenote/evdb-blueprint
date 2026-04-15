import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRisk Enrichment", () => {
  it("BBB loan with short maturity: verifies deterministic computations", async () => {
    // BBB, $1,000,000, 2-year maturity (< 5 years → no maturity adjustment)
    const input = {
      portfolioId: "portfolio-bbb",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 5.5,
      loanAmount: 1_000_000,
      loanId: "loan-bbb-001",
      maturityDate: new Date("2028-04-15"),
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

    // acquisitionDate is the current timestamp set during enrichment
    assert.ok(result.acquisitionDate instanceof Date);

    // Step 1: BBB → PD = 0.20% = 0.0020
    assert.strictEqual(result.probabilityOfDefault, 0.0020);

    // Step 2: BBB baseRiskWeight = 0.50; maturity ≈ 2 years < 5 → no adjustment
    // Step 3: capitalRequirement = 1_000_000 × 0.50 × 0.08 = 40_000
    assert.strictEqual(result.capitalRequirement, 40_000);

    // Step 4: expectedLoss = 1_000_000 × 0.0020 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);

    // Step 5: adjustedRiskWeight = 0.50 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Monte Carlo outputs are non-negative numbers (stochastic, only type/range checked)
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.ok(result.worstCaseLoss >= 0);
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.tailRiskLoss >= 0);

    // riskNarrative contains rating and band
    assert.ok(result.riskNarrative.includes("BBB loan ($1000000)"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
    assert.ok(result.riskNarrative.includes("Simulated default rate:"));
    assert.ok(result.riskNarrative.includes("VaR(95%):"));
  });

  it("CCC loan with long maturity: verifies maturity adjustment and Speculative-Critical band", async () => {
    // CCC, $500,000, 7-year maturity (> 5 years → risk weight × 1.15)
    const input = {
      portfolioId: "portfolio-ccc",
      borrowerName: "Risky Ventures",
      creditRating: "CCC",
      interestRate: 12.0,
      loanAmount: 500_000,
      loanId: "loan-ccc-001",
      maturityDate: new Date("2033-04-15"),
    };

    const result = await enrich(input);

    // Step 1: CCC → PD = 10% = 0.10
    assert.strictEqual(result.probabilityOfDefault, 0.10);

    // Step 2: CCC baseRiskWeight = 1.50; maturity ≈ 7 years > 5 → adjustedRiskWeight = 1.50 × 1.15 = 1.725
    // Step 3: capitalRequirement = 500_000 × 1.725 × 0.08 = 69_000
    // Using approximate equality to handle IEEE 754 floating point (1.5 × 1.15 is not exact)
    assert.ok(Math.abs(result.capitalRequirement - 69_000) < 0.01, `capitalRequirement expected ~69000, got ${result.capitalRequirement}`);

    // Step 4: expectedLoss = 500_000 × 0.10 × 0.45 = 22_500
    assert.ok(Math.abs(result.expectedLoss - 22_500) < 0.01, `expectedLoss expected ~22500, got ${result.expectedLoss}`);

    // Step 5: adjustedRiskWeight = 1.725 > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");

    assert.ok(result.riskNarrative.includes("CCC loan ($500000)"));
    assert.ok(result.riskNarrative.includes("Speculative - Critical"));
  });

  it("AAA loan: verifies Investment Grade - Low band", async () => {
    // AAA, $2,000,000, 3-year maturity (< 5 years → no adjustment)
    const input = {
      portfolioId: "portfolio-aaa",
      borrowerName: "Safe Corp",
      creditRating: "AAA",
      interestRate: 2.5,
      loanAmount: 2_000_000,
      loanId: "loan-aaa-001",
      maturityDate: new Date("2029-04-15"),
    };

    const result = await enrich(input);

    // Step 1: AAA → PD = 0.01% = 0.0001
    assert.strictEqual(result.probabilityOfDefault, 0.0001);

    // Step 2: AAA baseRiskWeight = 0.20; maturity ≈ 3 years < 5 → no adjustment
    // Step 3: capitalRequirement = 2_000_000 × 0.20 × 0.08 = 32_000
    assert.strictEqual(result.capitalRequirement, 32_000);

    // Step 4: expectedLoss = 2_000_000 × 0.0001 × 0.45 = 90
    assert.strictEqual(result.expectedLoss, 90);

    // Step 5: adjustedRiskWeight = 0.20 ≤ 0.30 → "Investment Grade - Low"
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
  });
});
