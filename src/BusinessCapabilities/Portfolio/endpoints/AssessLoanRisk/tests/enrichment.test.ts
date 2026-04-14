import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRisk Enrichment", () => {
  it("computes deterministic fields for BBB-rated loan within 5-year maturity", async () => {
    const maturityDate = new Date("2028-01-01"); // ~1.7 years from 2026-04-14, no maturity adj
    const input = {
      portfolioId: "portfolio-1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.05,
      loanAmount: 1000000,
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

    // Deterministic computed fields
    assert.ok(result.acquisitionDate instanceof Date);
    assert.strictEqual(result.probabilityOfDefault, 0.002);
    assert.strictEqual(result.expectedLoss, 900); // 1_000_000 * 0.002 * 0.45
    // BBB risk weight = 0.50, no maturity adj → capitalRequirement = 1_000_000 * 0.50 * 0.08 = 40_000
    assert.ok(Math.abs(result.capitalRequirement - 40000) < 0.01);
    assert.strictEqual(result.riskBand, "Investment Grade - Medium"); // 0.50 ≤ 0.55

    // Monte Carlo fields are numbers within valid ranges
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.ok(result.worstCaseLoss >= 0);
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss); // CVaR ≥ VaR

    // Risk narrative contains key identifiers
    assert.ok(result.riskNarrative.includes("BBB"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
    assert.ok(result.riskNarrative.includes("$1000000"));
    assert.ok(result.riskNarrative.includes("VaR(95%)"));
    assert.ok(result.riskNarrative.includes("Tail risk"));
  });

  it("applies maturity adjustment for loans over 5 years", async () => {
    const maturityDate = new Date("2032-06-01"); // ~6.1 years from 2026-04-14
    const input = {
      portfolioId: "portfolio-2",
      borrowerName: "Long Corp",
      creditRating: "AAA",
      interestRate: 0.03,
      loanAmount: 1000000,
      loanId: "loan-002",
      maturityDate,
    };

    const result = await enrich(input);

    // AAA base risk weight 0.20 × 1.15 maturity adj = 0.23
    // capitalRequirement = 1_000_000 * 0.23 * 0.08 = 18_400
    assert.ok(Math.abs(result.capitalRequirement - 18400) < 0.01);
    assert.strictEqual(result.riskBand, "Investment Grade - Low"); // 0.23 ≤ 0.30
    assert.strictEqual(result.probabilityOfDefault, 0.0001);
    assert.strictEqual(result.expectedLoss, 45); // 1_000_000 * 0.0001 * 0.45
  });

  it("assigns Speculative - Critical band for CCC rating", async () => {
    const maturityDate = new Date("2028-01-01");
    const input = {
      portfolioId: "portfolio-3",
      borrowerName: "High Risk Corp",
      creditRating: "CCC",
      interestRate: 0.15,
      loanAmount: 500000,
      loanId: "loan-003",
      maturityDate,
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.10);
    assert.strictEqual(result.riskBand, "Speculative - Critical"); // 1.50 > 1.00
    assert.strictEqual(result.expectedLoss, 22500); // 500_000 * 0.10 * 0.45
    // capitalRequirement = 500_000 * 1.50 * 0.08 = 60_000
    assert.ok(Math.abs(result.capitalRequirement - 60000) < 0.01);
  });

  it("assigns Speculative - High band for B rating", async () => {
    const maturityDate = new Date("2028-01-01");
    const input = {
      portfolioId: "portfolio-4",
      borrowerName: "Junk Bond Corp",
      creditRating: "B",
      interestRate: 0.10,
      loanAmount: 200000,
      loanId: "loan-004",
      maturityDate,
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.03);
    assert.strictEqual(result.riskBand, "Speculative - High"); // 1.00 ≤ 1.00
    assert.strictEqual(result.expectedLoss, 2700); // 200_000 * 0.03 * 0.45
  });
});
