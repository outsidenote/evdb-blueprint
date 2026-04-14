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

    const params = result[0].params;
    assert.strictEqual(params[0], "PortfolioLoanDetails", 'params[0] should be projectionName');
    assert.strictEqual(params[1], "test-portfolioId-001:test-loanId-001", 'params[1] should be composite key');
    assert.strictEqual(params[2], payload.portfolioId, 'params[2] should be portfolioId');
    assert.strictEqual(params[3], payload.loanId, 'params[3] should be loanId');
    assert.deepStrictEqual(params[4], payload.acquisitionDate, 'params[4] should be acquisitionDate');
    assert.strictEqual(params[5], payload.borrowerName, 'params[5] should be borrowerName');
    assert.strictEqual(params[6], payload.capitalRequirement, 'params[6] should be capitalRequirement');
    assert.strictEqual(params[7], payload.creditRating, 'params[7] should be creditRating');
    assert.strictEqual(params[8], payload.expectedLoss, 'params[8] should be expectedLoss');
    assert.strictEqual(params[9], payload.interestRate, 'params[9] should be interestRate');
    assert.strictEqual(params[10], payload.loanAmount, 'params[10] should be loanAmount');
    assert.deepStrictEqual(params[11], payload.maturityDate, 'params[11] should be maturityDate');
    assert.strictEqual(params[12], payload.probabilityOfDefault, 'params[12] should be probabilityOfDefault');
    assert.strictEqual(params[13], payload.riskBand, 'params[13] should be riskBand');
    assert.strictEqual(params[14], payload.expectedPortfolioLoss, 'params[14] should be expectedPortfolioLoss');
    assert.strictEqual(params[15], payload.riskNarrative, 'params[15] should be riskNarrative');
    assert.strictEqual(params[16], payload.simulatedDefaultRate, 'params[16] should be simulatedDefaultRate');
    assert.strictEqual(params[17], payload.tailRiskLoss, 'params[17] should be tailRiskLoss');
    assert.strictEqual(params[18], payload.worstCaseLoss, 'params[18] should be worstCaseLoss');
  });

});
