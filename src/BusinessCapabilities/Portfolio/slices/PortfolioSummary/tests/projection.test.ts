import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioSummarySlice } from "../index.js";

describe("Projection: PortfolioSummary", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioSummarySlice.projectionName, "PortfolioSummary");
  });

  it("LoanRiskAssessed handler returns SQL statements", () => {
    const payload = {
      portfolioId: "PORT-01",
      loanId: "LOAN-001",
      borrowerName: "Test Corp",
      loanAmount: 10000,
      capitalRequirement: 1000,
      expectedLoss: 100,
      riskWeight: 0.25,
      probabilityOfDefault: 0.05,
      creditRating: "AA",
      riskBand: "Investment Grade",
      interestRate: 0.03,
      acquisitionDate: new Date("2025-01-15"),
      maturityDate: new Date("2030-01-15"),
      expectedPortfolioLoss: 200,
      riskNarrative: "Low risk",
      simulatedDefaultRate: 0.02,
      tailRiskLoss: 500,
      worstCaseLoss: 800,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');

    // params: [projectionName, key, portfolioId, loanAmount, capitalRequirement, expectedLoss, riskWeight, probabilityOfDefault, creditRating]
    assert.strictEqual(result[0].params[0], "PortfolioSummary", 'params[0] should be projectionName');
    assert.strictEqual(result[0].params[1], "PORT-01", 'params[1] should be portfolioId (key)');
    assert.strictEqual(result[0].params[2], "PORT-01", 'params[2] should be portfolioId');
    assert.strictEqual(result[0].params[3], 10000, 'params[3] should be loanAmount');
    assert.strictEqual(result[0].params[4], 1000, 'params[4] should be capitalRequirement');
    assert.strictEqual(result[0].params[5], 100, 'params[5] should be expectedLoss');
    assert.strictEqual(result[0].params[6], 0.25, 'params[6] should be riskWeight');
    assert.strictEqual(result[0].params[7], 0.05, 'params[7] should be probabilityOfDefault');
    assert.strictEqual(result[0].params[8], "AA", 'params[8] should be creditRating');
  });

});
