import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioLoanDetailsSlice } from "../index.js";

describe("Projection: PortfolioLoanDetails", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioLoanDetailsSlice.projectionName, "PortfolioLoanDetails");
  });

  it("LoanRiskAssessed handler returns SQL statements", () => {
    const payload = {
      portfolioId: "test-portfolioId-001",
      loanId: "test-loanId-001",
      acquisitionDate: new Date("2025-01-01T11:00:00Z"),
      borrowerName: "test-borrowerName",
      capitalRequirement: "test-capitalRequirement",
      creditRating: "test-creditRating",
      expectedLoss: 0,
      interestRate: 0,
      loanAmount: 0,
      maturityDate: new Date("2025-01-01T11:00:00Z"),
      probabilityOfDefault: 0,
      riskBand: "test-riskBand",
      expectedPortfolioLoss: 0,
      riskNarrative: "test-riskNarrative",
      simulatedDefaultRate: 0,
      tailRiskLoss: 0,
      worstCaseLoss: 0,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioLoanDetails" };
    const result = portfolioLoanDetailsSlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.strictEqual(result[0].params.length, 19, 'should have 19 params');

    const params = result[0].params;
    assert.strictEqual(params[0], "PortfolioLoanDetails", 'params[0] should be projectionName');
    assert.strictEqual(params[1], "test-portfolioId-001:test-loanId-001", 'params[1] should be composite key');
    assert.strictEqual(params[2], "test-portfolioId-001", 'params[2] should be portfolioId');
    assert.strictEqual(params[3], "test-loanId-001", 'params[3] should be loanId');
    assert.strictEqual(params[4], new Date("2025-01-01T11:00:00Z").toISOString(), 'params[4] should be acquisitionDate ISO string');
    assert.strictEqual(params[5], "test-borrowerName", 'params[5] should be borrowerName');
    assert.strictEqual(params[6], "test-capitalRequirement", 'params[6] should be capitalRequirement');
    assert.strictEqual(params[7], "test-creditRating", 'params[7] should be creditRating');
    assert.strictEqual(params[8], 0, 'params[8] should be expectedLoss');
    assert.strictEqual(params[9], 0, 'params[9] should be interestRate');
    assert.strictEqual(params[10], 0, 'params[10] should be loanAmount');
    assert.strictEqual(params[11], new Date("2025-01-01T11:00:00Z").toISOString(), 'params[11] should be maturityDate ISO string');
    assert.strictEqual(params[12], 0, 'params[12] should be probabilityOfDefault');
    assert.strictEqual(params[13], "test-riskBand", 'params[13] should be riskBand');
    assert.strictEqual(params[14], 0, 'params[14] should be expectedPortfolioLoss');
    assert.strictEqual(params[15], "test-riskNarrative", 'params[15] should be riskNarrative');
    assert.strictEqual(params[16], 0, 'params[16] should be simulatedDefaultRate');
    assert.strictEqual(params[17], 0, 'params[17] should be tailRiskLoss');
    assert.strictEqual(params[18], 0, 'params[18] should be worstCaseLoss');
  });

});
