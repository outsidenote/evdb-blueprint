import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioLoanDetailsSlice } from "../index.js";

describe("Projection: PortfolioLoanDetails", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioLoanDetailsSlice.projectionName, "PortfolioLoanDetails");
  });

  it("LoanRiskAssessed handler returns SQL statements", () => {
    const acquisitionDate = new Date("2025-01-01T11:00:00Z");
    const maturityDate = new Date("2030-06-15T00:00:00Z");
    const payload = {
      portfolioId: "test-portfolioId-001",
      loanId: "test-loanId-001",
      acquisitionDate,
      borrowerName: "test-borrowerName",
      capitalRequirement: 1500000,
      creditRating: "BB+",
      expectedLoss: 45000,
      interestRate: 0.065,
      loanAmount: 2000000,
      maturityDate,
      probabilityOfDefault: 0.03,
      riskBand: "MEDIUM",
      expectedPortfolioLoss: 60000,
      riskNarrative: "test-riskNarrative",
      simulatedDefaultRate: 0.025,
      tailRiskLoss: 300000,
      worstCaseLoss: 500000,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioLoanDetails" };
    const result = portfolioLoanDetailsSlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');

    const params = result[0].params;
    assert.strictEqual(params[0], "PortfolioLoanDetails", "param[0] should be projectionName");
    assert.strictEqual(params[1], "test-portfolioId-001:test-loanId-001", "param[1] should be composite key");
    assert.strictEqual(params[2], "test-portfolioId-001", "param[2] should be portfolioId");
    assert.strictEqual(params[3], "test-loanId-001", "param[3] should be loanId");
    assert.strictEqual(params[4], acquisitionDate, "param[4] should be acquisitionDate");
    assert.strictEqual(params[5], "test-borrowerName", "param[5] should be borrowerName");
    assert.strictEqual(params[6], 1500000, "param[6] should be capitalRequirement");
    assert.strictEqual(params[7], "BB+", "param[7] should be creditRating");
    assert.strictEqual(params[8], 45000, "param[8] should be expectedLoss");
    assert.strictEqual(params[9], 0.065, "param[9] should be interestRate");
    assert.strictEqual(params[10], 2000000, "param[10] should be loanAmount");
    assert.strictEqual(params[11], maturityDate, "param[11] should be maturityDate");
    assert.strictEqual(params[12], 0.03, "param[12] should be probabilityOfDefault");
    assert.strictEqual(params[13], "MEDIUM", "param[13] should be riskBand");
    assert.strictEqual(params[14], 60000, "param[14] should be expectedPortfolioLoss");
    assert.strictEqual(params[15], "test-riskNarrative", "param[15] should be riskNarrative");
    assert.strictEqual(params[16], 0.025, "param[16] should be simulatedDefaultRate");
    assert.strictEqual(params[17], 300000, "param[17] should be tailRiskLoss");
    assert.strictEqual(params[18], 500000, "param[18] should be worstCaseLoss");
  });

});
