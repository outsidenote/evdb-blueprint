import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRiskProcessor Enrichment", () => {
  const baseInput = {
    portfolioId: "port-1",
    borrowerName: "Acme Corp",
    creditRating: "BBB",
    interestRate: 0.045,
    loanAmount: 1_000_000,
    loanId: "loan-1",
    maturityDate: new Date(Date.now() + 3 * 365.25 * 24 * 60 * 60 * 1000), // 3 years out
  };

  it("passes through all input fields unchanged", async () => {
    const result = await enrich(baseInput);
    assert.strictEqual(result.portfolioId, baseInput.portfolioId);
    assert.strictEqual(result.borrowerName, baseInput.borrowerName);
    assert.strictEqual(result.creditRating, baseInput.creditRating);
    assert.strictEqual(result.interestRate, baseInput.interestRate);
    assert.strictEqual(result.loanAmount, baseInput.loanAmount);
    assert.strictEqual(result.loanId, baseInput.loanId);
    assert.strictEqual(result.maturityDate, baseInput.maturityDate);
  });

  it("enriches input with all required computed fields", async () => {
    const result = await enrich(baseInput);
    assert.ok(result.acquisitionDate instanceof Date);
    assert.strictEqual(typeof result.capitalRequirement, "number");
    assert.strictEqual(typeof result.expectedLoss, "number");
    assert.strictEqual(typeof result.probabilityOfDefault, "number");
    assert.strictEqual(typeof result.riskBand, "string");
    assert.ok(result.riskBand.length > 0);
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.strictEqual(typeof result.riskNarrative, "string");
    assert.ok(result.riskNarrative.length > 0);
  });

  it("computes deterministic Basel III values for BBB rating (3-year maturity)", async () => {
    const result = await enrich(baseInput);
    // BBB: PD = 0.002, risk weight = 0.50 (no maturity adjustment, <5 years)
    assert.strictEqual(result.probabilityOfDefault, 0.002);
    // capitalRequirement = 1_000_000 × 0.50 × 0.08 = 40_000
    assert.strictEqual(result.capitalRequirement, 40_000);
    // expectedLoss = 1_000_000 × 0.002 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");
  });

  it("applies maturity adjustment for loans > 5 years", async () => {
    const longMaturity = {
      ...baseInput,
      creditRating: "BBB",
      maturityDate: new Date(Date.now() + 7 * 365.25 * 24 * 60 * 60 * 1000), // 7 years
    };
    const result = await enrich(longMaturity);
    // BBB base risk weight = 0.50, adjusted = 0.50 × 1.15 = 0.575 → Speculative - High
    assert.strictEqual(result.riskBand, "Speculative - High");
    // capitalRequirement = 1_000_000 × 0.575 × 0.08 = 46_000
    assert.strictEqual(result.capitalRequirement, 46_000);
  });

  it("assigns correct risk band for AAA (Investment Grade - Low)", async () => {
    const result = await enrich({ ...baseInput, creditRating: "AAA" });
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
    assert.strictEqual(result.probabilityOfDefault, 0.0001);
  });

  it("assigns Speculative - Critical for CCC rating with long maturity", async () => {
    const input = {
      ...baseInput,
      creditRating: "CCC",
      maturityDate: new Date(Date.now() + 7 * 365.25 * 24 * 60 * 60 * 1000),
    };
    const result = await enrich(input);
    // CCC base = 1.50 × 1.15 = 1.725 → Speculative - Critical
    assert.strictEqual(result.riskBand, "Speculative - Critical");
  });

  it("produces valid Monte Carlo simulation results", async () => {
    const result = await enrich(baseInput);
    assert.ok(result.simulatedDefaultRate >= 0);
    assert.ok(result.simulatedDefaultRate <= 1);
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.ok(result.worstCaseLoss >= result.expectedPortfolioLoss);
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss);
  });

  it("includes key metrics in risk narrative", async () => {
    const result = await enrich(baseInput);
    assert.ok(result.riskNarrative.includes("BBB"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
    assert.ok(result.riskNarrative.includes("VaR(95%)"));
    assert.ok(result.riskNarrative.includes("Tail risk"));
  });
});
