import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRisk Enrichment", () => {
  it("computes deterministic fields for BBB loan with short maturity (< 5 years)", async () => {
    // maturityDate ~3 years from 2026-04-15 → no maturity adjustment
    const input = {
      portfolioId: "portfolio-1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.05,
      loanAmount: 1_000_000,
      loanId: "loan-1",
      maturityDate: new Date("2029-04-15"),
    };

    const result = await enrich(input);

    // Passthrough fields
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // acquisitionDate is set to current timestamp
    assert.ok(result.acquisitionDate instanceof Date);

    // Step 1: probabilityOfDefault(BBB) = 0.20% = 0.002
    assert.strictEqual(result.probabilityOfDefault, 0.002);

    // Step 2: baseRiskWeight(BBB) = 0.50; yearsToMaturity ≈ 3 < 5 → no adjustment
    //         adjustedRiskWeight = 0.50

    // Step 3: capitalRequirement = loanAmount × adjustedRiskWeight × 0.08
    //         = 1_000_000 × 0.50 × 0.08 = 40_000
    assert.strictEqual(result.capitalRequirement, 40_000);

    // Step 4: expectedLoss = loanAmount × PD × LGD(0.45)
    //         = 1_000_000 × 0.002 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);

    // Step 5: adjustedRiskWeight = 0.50 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Steps 6-7: Monte Carlo results (non-deterministic) — type and range checks
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.ok(result.worstCaseLoss >= 0);
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss);

    // Step 8: narrative is a non-empty string containing key identifiers
    assert.strictEqual(typeof result.riskNarrative, "string");
    assert.ok(result.riskNarrative.length > 0);
    assert.ok(result.riskNarrative.includes("BBB"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
  });

  it("applies maturity adjustment for BBB loan with long maturity (> 5 years)", async () => {
    // maturityDate ~7 years from 2026-04-15 → maturity adjustment × 1.15 applies
    const input = {
      portfolioId: "portfolio-2",
      borrowerName: "Beta Corp",
      creditRating: "BBB",
      interestRate: 0.06,
      loanAmount: 2_000_000,
      loanId: "loan-2",
      maturityDate: new Date("2033-04-15"),
    };

    const result = await enrich(input);

    // Step 1: probabilityOfDefault(BBB) = 0.002
    assert.strictEqual(result.probabilityOfDefault, 0.002);

    // Step 2: baseRiskWeight(BBB) = 0.50; yearsToMaturity ≈ 7 > 5 → × 1.15
    //         adjustedRiskWeight = 0.50 × 1.15 = 0.575

    // Step 3: capitalRequirement = 2_000_000 × 0.575 × 0.08 = 92_000
    assert.ok(Math.abs(result.capitalRequirement - 92_000) < 0.01);

    // Step 4: expectedLoss = 2_000_000 × 0.002 × 0.45 = 1_800
    assert.strictEqual(result.expectedLoss, 1_800);

    // Step 5: adjustedRiskWeight = 0.575 > 0.55 and ≤ 1.00 → "Speculative - High"
    // (BBB without maturity adjustment is "Investment Grade - Medium"; adjustment pushes it over 0.55)
    assert.strictEqual(result.riskBand, "Speculative - High");
  });

  it("classifies AAA loan as Investment Grade - Low with no maturity adjustment", async () => {
    // maturityDate ~2 years from 2026-04-15 → no maturity adjustment
    const input = {
      portfolioId: "portfolio-3",
      borrowerName: "Gamma Corp",
      creditRating: "AAA",
      interestRate: 0.03,
      loanAmount: 500_000,
      loanId: "loan-3",
      maturityDate: new Date("2028-04-15"),
    };

    const result = await enrich(input);

    // Step 1: probabilityOfDefault(AAA) = 0.01% = 0.0001
    assert.strictEqual(result.probabilityOfDefault, 0.0001);

    // Step 2: baseRiskWeight(AAA) = 0.20; yearsToMaturity ≈ 2 < 5 → no adjustment
    //         adjustedRiskWeight = 0.20

    // Step 3: capitalRequirement = 500_000 × 0.20 × 0.08 = 8_000
    assert.strictEqual(result.capitalRequirement, 8_000);

    // Step 4: expectedLoss = 500_000 × 0.0001 × 0.45 = 22.5
    assert.strictEqual(result.expectedLoss, 22.5);

    // Step 5: adjustedRiskWeight = 0.20 ≤ 0.30 → "Investment Grade - Low"
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
  });

  it("classifies CCC loan with long maturity as Speculative - Critical", async () => {
    // maturityDate ~7 years from 2026-04-15 → maturity adjustment × 1.15 applies
    const input = {
      portfolioId: "portfolio-4",
      borrowerName: "Delta Corp",
      creditRating: "CCC",
      interestRate: 0.15,
      loanAmount: 300_000,
      loanId: "loan-4",
      maturityDate: new Date("2033-04-15"),
    };

    const result = await enrich(input);

    // Step 1: probabilityOfDefault(CCC) = 10% = 0.10
    assert.strictEqual(result.probabilityOfDefault, 0.10);

    // Step 2: baseRiskWeight(CCC) = 1.50; yearsToMaturity ≈ 7 > 5 → × 1.15
    //         adjustedRiskWeight = 1.50 × 1.15 = 1.725

    // Step 3: capitalRequirement = 300_000 × 1.725 × 0.08 = 41_400
    assert.ok(Math.abs(result.capitalRequirement - 41_400) < 0.01);

    // Step 4: expectedLoss = 300_000 × 0.10 × 0.45 = 13_500
    assert.strictEqual(result.expectedLoss, 13_500);

    // Step 5: adjustedRiskWeight = 1.725 > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");

    // Monte Carlo: with PD=0.10 and 1000 iterations expect ~100 defaults
    // lossIfDefault = 300_000 × (1 - 0.20) = 240_000
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss);
  });
});
