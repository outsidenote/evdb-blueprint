import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.25;

describe("AssessLoanRisk Enrichment", () => {
  it("enriches a BBB-rated loan (maturity < 5 years) with correct deterministic fields", async () => {
    // 3 years to maturity — no Basel III maturity adjustment
    const maturityDate = new Date(Date.now() + 3 * MS_PER_YEAR);
    const input = {
      portfolioId: "portfolio-1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.05,
      loanAmount: 1_000_000,
      loanId: "loan-1",
      maturityDate,
    };

    const result = await enrich(input);

    // Pass-through fields
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // Acquisition date is set to now
    assert.ok(result.acquisitionDate instanceof Date);

    // Step 1: BBB PD = 0.0020
    assert.strictEqual(result.probabilityOfDefault, 0.0020);

    // Step 3: capitalRequirement = 1_000_000 × 0.50 × 0.08 = 40_000
    assert.strictEqual(result.capitalRequirement, 40_000);

    // Step 4: expectedLoss = 1_000_000 × 0.002 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);

    // Step 5: BBB adjusted weight 0.50 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Step 7: Monte Carlo results are probabilistic — check type and plausible range
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.ok(result.worstCaseLoss >= 0);
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.tailRiskLoss >= worstCaseLoss || result.tailRiskLoss >= 0);

    // Step 8: Narrative contains required components
    assert.ok(result.riskNarrative.includes("BBB loan ($1000000)"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
    assert.ok(result.riskNarrative.includes("Simulated default rate:"));
    assert.ok(result.riskNarrative.includes("Expected loss:"));
    assert.ok(result.riskNarrative.includes("VaR(95%):"));
    assert.ok(result.riskNarrative.includes("Tail risk:"));
  });

  it("applies Basel III maturity adjustment for loans with maturity > 5 years", async () => {
    // 7 years to maturity — risk weight multiplied by 1.15
    const maturityDate = new Date(Date.now() + 7 * MS_PER_YEAR);
    const input = {
      portfolioId: "portfolio-2",
      borrowerName: "Beta Corp",
      creditRating: "A",
      interestRate: 0.04,
      loanAmount: 500_000,
      loanId: "loan-2",
      maturityDate,
    };

    const result = await enrich(input);

    // Step 1: A-rated PD = 0.0005
    assert.strictEqual(result.probabilityOfDefault, 0.0005);

    // Step 2: A base weight 0.35 × 1.15 = 0.4025
    // Step 3: capitalRequirement = 500_000 × 0.4025 × 0.08 = 16_100
    assert.strictEqual(result.capitalRequirement, 500_000 * 0.35 * 1.15 * 0.08);

    // Step 4: expectedLoss = 500_000 × 0.0005 × 0.45 = 112.5
    assert.strictEqual(result.expectedLoss, 500_000 * 0.0005 * 0.45);

    // Step 5: adjusted weight 0.4025 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");
  });

  it("maps CCC rating to Speculative - Critical band", async () => {
    const maturityDate = new Date(Date.now() + 2 * MS_PER_YEAR);
    const input = {
      portfolioId: "portfolio-3",
      borrowerName: "Risky Corp",
      creditRating: "CCC",
      interestRate: 0.15,
      loanAmount: 100_000,
      loanId: "loan-3",
      maturityDate,
    };

    const result = await enrich(input);

    // CCC: PD = 0.10, risk weight = 1.50 (no maturity adjustment, < 5 years)
    assert.strictEqual(result.probabilityOfDefault, 0.10);
    // capitalRequirement = 100_000 × 1.50 × 0.08 = 12_000
    assert.strictEqual(result.capitalRequirement, 12_000);
    // risk weight 1.50 > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");
  });
});
