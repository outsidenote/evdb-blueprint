import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

const threeYearsFromNow = new Date(Date.now() + 3 * 365.25 * 24 * 60 * 60 * 1000);
const sevenYearsFromNow = new Date(Date.now() + 7 * 365.25 * 24 * 60 * 60 * 1000);

describe("AssessLoanRisk Enrichment", () => {
  it("BBB loan within 5 years — deterministic fields", async () => {
    const input = {
      portfolioId: "port-001",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 4.5,
      loanAmount: 1_000_000,
      loanId: "loan-001",
      maturityDate: threeYearsFromNow,
    };

    const result = await enrich(input);

    // Step 1: PD for BBB = 0.20% = 0.002
    assert.strictEqual(result.probabilityOfDefault, 0.002);

    // Step 2: baseRiskWeight(BBB) = 0.50; maturity 3yr ≤ 5yr → no adjustment → 0.50
    // Step 3: capitalRequirement = 1_000_000 × 0.50 × 0.08 = 40_000
    assert.strictEqual(result.capitalRequirement, 40_000);

    // Step 4: expectedLoss = 1_000_000 × 0.002 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);

    // Step 5: adjustedRiskWeight 0.50 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Pass-through fields preserved
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // acquisitionDate is set by the enrichment function
    assert.ok(result.acquisitionDate instanceof Date);

    // Simulation fields — non-deterministic, check types and plausible ranges
    // recoveryRate(BBB) = 0.55; lossIfDefault = 1_000_000 × (1 − 0.55) = 450_000
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);

    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.ok(result.expectedPortfolioLoss >= 0);

    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.ok(result.worstCaseLoss >= 0 && result.worstCaseLoss <= 450_000);

    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss);

    // Narrative includes credit rating, loan amount, and risk band
    assert.ok(result.riskNarrative.startsWith("BBB loan ($1000000):"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
  });

  it("BB loan beyond 5 years — maturity adjustment applied", async () => {
    const input = {
      portfolioId: "port-002",
      borrowerName: "Beta Ltd",
      creditRating: "BB",
      interestRate: 6.0,
      loanAmount: 500_000,
      loanId: "loan-002",
      maturityDate: sevenYearsFromNow,
    };

    const result = await enrich(input);

    // Step 1: PD for BB = 1.00% = 0.01
    assert.strictEqual(result.probabilityOfDefault, 0.01);

    // Step 2: baseRiskWeight(BB) = 0.75; maturity 7yr > 5yr → × 1.15 = 0.8625
    // Step 3: capitalRequirement = 500_000 × 0.8625 × 0.08 = 34_500
    assert.strictEqual(result.capitalRequirement, 34_500);

    // Step 4: expectedLoss = 500_000 × 0.01 × 0.45 = 2_250
    assert.strictEqual(result.expectedLoss, 2_250);

    // Step 5: adjustedRiskWeight 0.8625 ≤ 1.00 → "Speculative - High"
    assert.strictEqual(result.riskBand, "Speculative - High");

    // Narrative correctness
    assert.ok(result.riskNarrative.startsWith("BB loan ($500000):"));
    assert.ok(result.riskNarrative.includes("Speculative - High"));
  });

  it("AAA loan — Investment Grade - Low risk band", async () => {
    const input = {
      portfolioId: "port-003",
      borrowerName: "Prime Inc",
      creditRating: "AAA",
      interestRate: 2.0,
      loanAmount: 100_000,
      loanId: "loan-003",
      maturityDate: threeYearsFromNow,
    };

    const result = await enrich(input);

    // Step 1: PD for AAA = 0.01% = 0.0001
    assert.strictEqual(result.probabilityOfDefault, 0.0001);

    // Step 2: baseRiskWeight(AAA) = 0.20; maturity 3yr ≤ 5yr → 0.20
    // Step 3: capitalRequirement = 100_000 × 0.20 × 0.08 = 1_600
    assert.strictEqual(result.capitalRequirement, 1_600);

    // Step 4: expectedLoss = 100_000 × 0.0001 × 0.45 = 4.5
    assert.strictEqual(result.expectedLoss, 4.5);

    // Step 5: adjustedRiskWeight 0.20 ≤ 0.30 → "Investment Grade - Low"
    assert.strictEqual(result.riskBand, "Investment Grade - Low");

    assert.ok(result.riskNarrative.startsWith("AAA loan ($100000):"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Low"));
  });

  it("CCC loan — Speculative - Critical risk band", async () => {
    const input = {
      portfolioId: "port-004",
      borrowerName: "Distressed LLC",
      creditRating: "CCC",
      interestRate: 12.0,
      loanAmount: 200_000,
      loanId: "loan-004",
      maturityDate: threeYearsFromNow,
    };

    const result = await enrich(input);

    // Step 1: PD for CCC = 10.00% = 0.10
    assert.strictEqual(result.probabilityOfDefault, 0.10);

    // Step 2: baseRiskWeight(CCC) = 1.50; maturity 3yr ≤ 5yr → 1.50
    // Step 3: capitalRequirement = 200_000 × 1.50 × 0.08 = 24_000
    assert.strictEqual(result.capitalRequirement, 24_000);

    // Step 4: expectedLoss = 200_000 × 0.10 × 0.45 = 9_000
    assert.strictEqual(result.expectedLoss, 9_000);

    // Step 5: adjustedRiskWeight 1.50 > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");

    // Simulation: recoveryRate(CCC) = 0.20; lossIfDefault = 200_000 × (1 − 0.20) = 160_000
    // With PD=0.10 and 1000 iterations, expect ~100 defaults; worstCaseLoss and tailRiskLoss ≈ 160_000
    assert.ok(result.worstCaseLoss >= 0 && result.worstCaseLoss <= 160_000);
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss);

    assert.ok(result.riskNarrative.startsWith("CCC loan ($200000):"));
    assert.ok(result.riskNarrative.includes("Speculative - Critical"));
  });

  it("riskNarrative contains all required components", async () => {
    const input = {
      portfolioId: "port-005",
      borrowerName: "Gamma SA",
      creditRating: "B",
      interestRate: 8.0,
      loanAmount: 750_000,
      loanId: "loan-005",
      maturityDate: threeYearsFromNow,
    };

    const result = await enrich(input);

    // Step 1: PD for B = 3.00% = 0.03
    // Step 2: baseRiskWeight(B) = 1.00; maturity 3yr ≤ 5yr → 1.00
    // Step 5: adjustedRiskWeight 1.00 ≤ 1.00 → "Speculative - High"
    assert.ok(result.riskNarrative.includes("Simulated default rate:"));
    assert.ok(result.riskNarrative.includes("Expected loss:"));
    assert.ok(result.riskNarrative.includes("VaR(95%):"));
    assert.ok(result.riskNarrative.includes("Tail risk:"));
    assert.strictEqual(result.riskBand, "Speculative - High");
  });
});
