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
    assert.ok(result[0].params.length > 0, 'params should not be empty');

    const params = result[0].params;
    assert.strictEqual(params[0], "PortfolioLoanDetails", 'param $1 should be projectionName');
    assert.strictEqual(params[1], "test-portfolioId-001:test-loanId-001", 'param $2 should be composite key');
    assert.strictEqual(params[2], "test-portfolioId-001", 'param $3 should be portfolioId');
    assert.strictEqual(params[3], "test-loanId-001", 'param $4 should be loanId');
    assert.deepStrictEqual(params[4], new Date("2025-01-01T11:00:00Z"), 'param $5 should be acquisitionDate');
    assert.strictEqual(params[5], "test-borrowerName", 'param $6 should be borrowerName');
    assert.strictEqual(params[7], "test-creditRating", 'param $8 should be creditRating');
    assert.strictEqual(params[13], "test-riskBand", 'param $14 should be riskBand');
    assert.strictEqual(params[15], "test-riskNarrative", 'param $16 should be riskNarrative');
  });

});
