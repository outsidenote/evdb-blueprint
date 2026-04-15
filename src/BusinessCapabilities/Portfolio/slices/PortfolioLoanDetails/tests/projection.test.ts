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
      capitalRequirement: 50000,
      creditRating: "BBB",
      expectedLoss: 1200.5,
      interestRate: 0.045,
      loanAmount: 250000,
      maturityDate,
      probabilityOfDefault: 0.03,
      riskBand: "MEDIUM",
      expectedPortfolioLoss: 7500,
      riskNarrative: "test-riskNarrative",
      simulatedDefaultRate: 0.025,
      tailRiskLoss: 15000,
      worstCaseLoss: 20000,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioLoanDetails" };
    const result = portfolioLoanDetailsSlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.ok(result[0].params.length > 0, 'params should not be empty');

    const params = result[0].params;
    assert.strictEqual(params[0], "PortfolioLoanDetails", "param[0] should be projectionName");
    assert.strictEqual(params[1], "test-portfolioId-001:test-loanId-001", "param[1] should be composite key");
    assert.strictEqual(params[2], "test-portfolioId-001", "param[2] should be portfolioId");
    assert.strictEqual(params[3], "test-loanId-001", "param[3] should be loanId");
    assert.strictEqual(params[4], acquisitionDate.toISOString(), "param[4] should be acquisitionDate ISO string");
    assert.strictEqual(params[5], "test-borrowerName", "param[5] should be borrowerName");
    assert.strictEqual(params[6], 50000, "param[6] should be capitalRequirement");
    assert.strictEqual(params[7], "BBB", "param[7] should be creditRating");
    assert.strictEqual(params[8], 1200.5, "param[8] should be expectedLoss");
    assert.strictEqual(params[9], 0.045, "param[9] should be interestRate");
    assert.strictEqual(params[10], 250000, "param[10] should be loanAmount");
    assert.strictEqual(params[11], maturityDate.toISOString(), "param[11] should be maturityDate ISO string");
    assert.strictEqual(params[12], 0.03, "param[12] should be probabilityOfDefault");
    assert.strictEqual(params[13], "MEDIUM", "param[13] should be riskBand");
    assert.strictEqual(params[14], 7500, "param[14] should be expectedPortfolioLoss");
    assert.strictEqual(params[15], "test-riskNarrative", "param[15] should be riskNarrative");
    assert.strictEqual(params[16], 0.025, "param[16] should be simulatedDefaultRate");
    assert.strictEqual(params[17], 15000, "param[17] should be tailRiskLoss");
    assert.strictEqual(params[18], 20000, "param[18] should be worstCaseLoss");
  });

});
