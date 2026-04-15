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
      creditRating: "test-creditRating",
      expectedLoss: 1500,
      interestRate: 0.045,
      loanAmount: 750000,
      maturityDate,
      probabilityOfDefault: 0.02,
      riskBand: "test-riskBand",
      expectedPortfolioLoss: 1200,
      riskNarrative: "test-riskNarrative",
      simulatedDefaultRate: 0.025,
      tailRiskLoss: 60000,
      worstCaseLoss: 120000,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioLoanDetails" };
    const result = portfolioLoanDetailsSlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');

    const params = result[0].params;
    assert.strictEqual(params[0], "PortfolioLoanDetails", "param $1 should be projectionName");
    assert.strictEqual(params[1], "test-portfolioId-001:test-loanId-001", "param $2 should be composite key");
    assert.strictEqual(params[2], "test-portfolioId-001", "param $3 should be portfolioId");
    assert.strictEqual(params[3], "test-loanId-001", "param $4 should be loanId");
    assert.strictEqual(params[4], acquisitionDate, "param $5 should be acquisitionDate");
    assert.strictEqual(params[5], "test-borrowerName", "param $6 should be borrowerName");
    assert.strictEqual(params[6], 50000, "param $7 should be capitalRequirement");
    assert.strictEqual(params[7], "test-creditRating", "param $8 should be creditRating");
    assert.strictEqual(params[8], 1500, "param $9 should be expectedLoss");
    assert.strictEqual(params[9], 0.045, "param $10 should be interestRate");
    assert.strictEqual(params[10], 750000, "param $11 should be loanAmount");
    assert.strictEqual(params[11], maturityDate, "param $12 should be maturityDate");
    assert.strictEqual(params[12], 0.02, "param $13 should be probabilityOfDefault");
    assert.strictEqual(params[13], "test-riskBand", "param $14 should be riskBand");
    assert.strictEqual(params[14], 1200, "param $15 should be expectedPortfolioLoss");
    assert.strictEqual(params[15], "test-riskNarrative", "param $16 should be riskNarrative");
    assert.strictEqual(params[16], 0.025, "param $17 should be simulatedDefaultRate");
    assert.strictEqual(params[17], 60000, "param $18 should be tailRiskLoss");
    assert.strictEqual(params[18], 120000, "param $19 should be worstCaseLoss");
  });

});
