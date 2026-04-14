import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

const now = Date.now();
const shortMaturity = new Date(now + 2 * 365 * 24 * 60 * 60 * 1000); // 2 years → no adjustment
const longMaturity = new Date(now + 7 * 365 * 24 * 60 * 60 * 1000);  // 7 years → ×1.15 adjustment

describe("AssessLoanRiskProcessor Enrichment", () => {
  it("passes through all input fields unchanged", async () => {
    const input = {
      portfolioId: "port-1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 4.5,
      loanAmount: 1_000_000,
      loanId: "loan-1",
      maturityDate: shortMaturity,
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

  it("computes deterministic fields correctly for BBB rated loan (short maturity)", async () => {
    const input = {
      portfolioId: "port-1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 4.5,
      loanAmount: 1_000_000,
      loanId: "loan-1",
      maturityDate: shortMaturity,
    };

    const result = await enrich(input);

    // BBB: PD = 0.20% = 0.002
    assert.strictEqual(result.probabilityOfDefault, 0.002);
    // Capital requirement: 1_000_000 × 0.50 × 0.08 = 40_000 (no maturity adjustment)
    assert.strictEqual(result.capitalRequirement, 40_000);
    // Expected loss: 1_000_000 × 0.002 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);
    // Risk band: adjusted weight = 0.50 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    assert.ok(result.acquisitionDate instanceof Date);
  });

  it("applies 1.15 maturity multiplier when maturity > 5 years", async () => {
    const input = {
      portfolioId: "port-2",
      borrowerName: "Beta Ltd",
      creditRating: "BB",
      interestRate: 6.0,
      loanAmount: 500_000,
      loanId: "loan-2",
      maturityDate: longMaturity,
    };

    const result = await enrich(input);

    // BB base risk weight = 0.75, adjusted = 0.75 × 1.15 = 0.8625
    // Capital requirement: 500_000 × 0.8625 × 0.08 = 34_500
    assert.strictEqual(result.capitalRequirement, 34_500);
    // Adjusted weight 0.8625 → "Speculative - High" (≤ 1.00)
    assert.strictEqual(result.riskBand, "Speculative - High");
  });

  it("derives correct risk band for CCC (Speculative - Critical)", async () => {
    const input = {
      portfolioId: "port-3",
      borrowerName: "Gamma Inc",
      creditRating: "CCC",
      interestRate: 12.0,
      loanAmount: 200_000,
      loanId: "loan-3",
      maturityDate: shortMaturity,
    };

    const result = await enrich(input);

    // CCC base risk weight = 1.50 (> 1.00) → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");
    assert.strictEqual(result.probabilityOfDefault, 0.1000);
  });

  it("derives correct risk band for AAA (Investment Grade - Low)", async () => {
    const input = {
      portfolioId: "port-4",
      borrowerName: "Delta AG",
      creditRating: "AAA",
      interestRate: 2.0,
      loanAmount: 1_000_000,
      loanId: "loan-4",
      maturityDate: shortMaturity,
    };

    const result = await enrich(input);

    // AAA risk weight = 0.20 ≤ 0.30 → "Investment Grade - Low"
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
    assert.strictEqual(result.probabilityOfDefault, 0.0001);
  });

  it("populates all Monte Carlo output fields as numbers", async () => {
    const input = {
      portfolioId: "port-5",
      borrowerName: "Epsilon Co",
      creditRating: "B",
      interestRate: 8.0,
      loanAmount: 750_000,
      loanId: "loan-5",
      maturityDate: shortMaturity,
    };

    const result = await enrich(input);

    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.simulatedDefaultRate >= 0);
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.ok(result.worstCaseLoss >= 0);
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss);
  });

  it("builds riskNarrative with expected format", async () => {
    const input = {
      portfolioId: "port-6",
      borrowerName: "Zeta Corp",
      creditRating: "A",
      interestRate: 3.5,
      loanAmount: 500_000,
      loanId: "loan-6",
      maturityDate: shortMaturity,
    };

    const result = await enrich(input);

    assert.ok(result.riskNarrative.startsWith("A loan ($500000):"));
    assert.ok(result.riskNarrative.includes("Simulated default rate:"));
    assert.ok(result.riskNarrative.includes("Expected loss:"));
    assert.ok(result.riskNarrative.includes("VaR(95%):"));
    assert.ok(result.riskNarrative.includes("Tail risk:"));
  });
});
