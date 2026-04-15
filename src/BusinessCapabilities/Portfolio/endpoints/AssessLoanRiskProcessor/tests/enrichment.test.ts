import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.25;

function yearsFromNow(years: number): Date {
  return new Date(Date.now() + years * MS_PER_YEAR);
}

describe("AssessLoanRiskProcessor Enrichment", () => {
  it("enriches BBB loan with short maturity — deterministic fields", async () => {
    // BBB, $1,000,000, 3yr maturity (< 5yr, no maturity adjustment)
    const input = {
      portfolioId: "port-001",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.05,
      loanAmount: 1_000_000,
      loanId: "loan-001",
      maturityDate: yearsFromNow(3),
    };

    const result = await enrich(input);

    // Input pass-through
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // acquisitionDate is today
    assert.ok(result.acquisitionDate instanceof Date);
    assert.ok(Math.abs(result.acquisitionDate.getTime() - Date.now()) < 5000);

    // Step 1: PD for BBB = 0.0020
    assert.strictEqual(result.probabilityOfDefault, 0.0020);

    // Step 3: capitalRequirement = 1,000,000 × 0.50 (BBB, no adj) × 0.08 = 40,000
    assert.strictEqual(result.capitalRequirement, 40_000);

    // Step 4: expectedLoss = 1,000,000 × 0.0020 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);

    // Step 5: adjustedRiskWeight = 0.50 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Monte Carlo fields are stochastic — verify type and plausible range
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 0.05,
      `simulatedDefaultRate ${result.simulatedDefaultRate} outside expected range for BBB (PD=0.20%)`);

    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.ok(result.worstCaseLoss >= 0);
    // CVaR (tail) should be >= VaR since it averages the worst scenarios
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss);

    // Narrative contains key identifiers
    assert.ok(result.riskNarrative.startsWith("BBB loan ($1000000):"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
    assert.ok(result.riskNarrative.includes("Simulated default rate:"));
    assert.ok(result.riskNarrative.includes("VaR(95%):"));
    assert.ok(result.riskNarrative.includes("Tail risk:"));
  });

  it("applies maturity adjustment when maturity > 5 years (A rating)", async () => {
    // A, $500,000, 7yr maturity (> 5yr → multiply risk weight by 1.15)
    const input = {
      portfolioId: "port-002",
      borrowerName: "Beta Ltd",
      creditRating: "A",
      interestRate: 0.04,
      loanAmount: 500_000,
      loanId: "loan-002",
      maturityDate: yearsFromNow(7),
    };

    const result = await enrich(input);

    // Step 1: PD for A = 0.0005
    assert.strictEqual(result.probabilityOfDefault, 0.0005);

    // Step 2: baseRiskWeight = 0.35, maturity 7yr > 5yr → 0.35 × 1.15 = 0.4025
    // Step 3: capitalRequirement = 500,000 × 0.4025 × 0.08 = 16,100
    assert.strictEqual(result.capitalRequirement, 16_100);

    // Step 4: expectedLoss = 500,000 × 0.0005 × 0.45 = 112.50
    assert.strictEqual(result.expectedLoss, 112.50);

    // Step 5: adjustedRiskWeight = 0.4025 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");
  });

  it("classifies AAA short-maturity loan as Investment Grade - Low", async () => {
    // AAA, $100,000, 2yr maturity (< 5yr, no adjustment)
    // Step 2: riskWeight = 0.20 ≤ 0.30 → "Investment Grade - Low"
    const input = {
      portfolioId: "port-003",
      borrowerName: "Gamma Inc",
      creditRating: "AAA",
      interestRate: 0.03,
      loanAmount: 100_000,
      loanId: "loan-003",
      maturityDate: yearsFromNow(2),
    };

    const result = await enrich(input);

    // Step 1: PD for AAA = 0.0001
    assert.strictEqual(result.probabilityOfDefault, 0.0001);

    // Step 3: capitalRequirement = 100,000 × 0.20 × 0.08 = 1,600
    assert.strictEqual(result.capitalRequirement, 1_600);

    // Step 4: expectedLoss = 100,000 × 0.0001 × 0.45 = 4.50
    assert.strictEqual(result.expectedLoss, 4.50);

    assert.strictEqual(result.riskBand, "Investment Grade - Low");
  });

  it("classifies BB loan as Speculative - High", async () => {
    // BB, $250,000, 3yr maturity (< 5yr, no adjustment)
    // Step 2: riskWeight = 0.75, 0.55 < 0.75 ≤ 1.00 → "Speculative - High"
    const input = {
      portfolioId: "port-004",
      borrowerName: "Delta LLC",
      creditRating: "BB",
      interestRate: 0.07,
      loanAmount: 250_000,
      loanId: "loan-004",
      maturityDate: yearsFromNow(3),
    };

    const result = await enrich(input);

    // Step 1: PD for BB = 0.0100
    assert.strictEqual(result.probabilityOfDefault, 0.0100);

    // Step 3: capitalRequirement = 250,000 × 0.75 × 0.08 = 15,000
    assert.strictEqual(result.capitalRequirement, 15_000);

    // Step 4: expectedLoss = 250,000 × 0.0100 × 0.45 = 1,125
    assert.strictEqual(result.expectedLoss, 1_125);

    assert.strictEqual(result.riskBand, "Speculative - High");
  });

  it("classifies CCC long-maturity loan as Speculative - Critical with Monte Carlo losses", async () => {
    // CCC, $200,000, 7yr maturity (> 5yr → multiply by 1.15)
    // Step 2: baseRiskWeight = 1.50, × 1.15 = 1.725 > 1.00 → "Speculative - Critical"
    const input = {
      portfolioId: "port-005",
      borrowerName: "Epsilon Co",
      creditRating: "CCC",
      interestRate: 0.12,
      loanAmount: 200_000,
      loanId: "loan-005",
      maturityDate: yearsFromNow(7),
    };

    const result = await enrich(input);

    // Step 1: PD for CCC = 0.1000
    assert.strictEqual(result.probabilityOfDefault, 0.1000);

    // Step 3: capitalRequirement = 200,000 × 1.725 × 0.08 = 27,600
    assert.strictEqual(result.capitalRequirement, 27_600);

    // Step 4: expectedLoss = 200,000 × 0.1000 × 0.45 = 9,000
    assert.strictEqual(result.expectedLoss, 9_000);

    assert.strictEqual(result.riskBand, "Speculative - Critical");

    // CCC has PD=10%, so Monte Carlo should produce meaningful defaults
    // With 1000 iterations and PD=0.10, expect ~100 defaults
    // simulatedDefaultRate ≈ 0.10, allow variance: 0.05 to 0.20
    assert.ok(result.simulatedDefaultRate > 0.04 && result.simulatedDefaultRate < 0.20,
      `simulatedDefaultRate ${result.simulatedDefaultRate} outside expected range for CCC (PD=10%)`);

    // recovery rate for CCC = 0.20, so loss per default = 200,000 × 0.80 = 160,000
    // expectedPortfolioLoss ≈ 0.10 × 160,000 = 16,000; allow wide range due to variance
    assert.ok(result.expectedPortfolioLoss > 5_000 && result.expectedPortfolioLoss < 30_000,
      `expectedPortfolioLoss ${result.expectedPortfolioLoss} outside expected range for CCC`);

    // With ~100 defaults, 95th percentile (index 950) falls in the defaulted scenarios
    // worstCaseLoss should be 160,000 (the per-default loss amount)
    assert.strictEqual(result.worstCaseLoss, 160_000);

    // tailRiskLoss (CVaR) = average of worst 5% = all 160,000 → 160,000
    assert.strictEqual(result.tailRiskLoss, 160_000);

    // Narrative check
    assert.ok(result.riskNarrative.startsWith("CCC loan ($200000):"));
    assert.ok(result.riskNarrative.includes("Speculative - Critical"));
  });
});
