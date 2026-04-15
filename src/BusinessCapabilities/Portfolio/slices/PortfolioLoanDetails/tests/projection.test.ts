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
    // $1 projectionName
    assert.strictEqual(params[0], "PortfolioLoanDetails", "param[0] should be projectionName");
    // $2 key = portfolioId
    assert.strictEqual(params[1], "test-portfolioId-001", "param[1] should be key (portfolioId)");
    // $3 portfolioId
    assert.strictEqual(params[2], "test-portfolioId-001", "param[2] should be portfolioId");
    // $4 loanId
    assert.strictEqual(params[3], "test-loanId-001", "param[3] should be loanId");
    // $5 acquisitionDate as ISO string
    assert.strictEqual(params[4], "2025-01-01T11:00:00.000Z", "param[4] should be acquisitionDate as ISO string");
    // $6 borrowerName
    assert.strictEqual(params[5], "test-borrowerName", "param[5] should be borrowerName");
    // $7 capitalRequirement
    assert.strictEqual(params[6], "test-capitalRequirement", "param[6] should be capitalRequirement");
    // $8 creditRating
    assert.strictEqual(params[7], "test-creditRating", "param[7] should be creditRating");
    // $9 expectedLoss
    assert.strictEqual(params[8], 0, "param[8] should be expectedLoss");
    // $10 interestRate
    assert.strictEqual(params[9], 0, "param[9] should be interestRate");
    // $11 loanAmount
    assert.strictEqual(params[10], 0, "param[10] should be loanAmount");
    // $12 maturityDate as ISO string
    assert.strictEqual(params[11], "2025-01-01T11:00:00.000Z", "param[11] should be maturityDate as ISO string");
    // $13 probabilityOfDefault
    assert.strictEqual(params[12], 0, "param[12] should be probabilityOfDefault");
    // $14 riskBand
    assert.strictEqual(params[13], "test-riskBand", "param[13] should be riskBand");
    // $15 expectedPortfolioLoss
    assert.strictEqual(params[14], 0, "param[14] should be expectedPortfolioLoss");
    // $16 riskNarrative
    assert.strictEqual(params[15], "test-riskNarrative", "param[15] should be riskNarrative");
    // $17 simulatedDefaultRate
    assert.strictEqual(params[16], 0, "param[16] should be simulatedDefaultRate");
    // $18 tailRiskLoss
    assert.strictEqual(params[17], 0, "param[17] should be tailRiskLoss");
    // $19 worstCaseLoss
    assert.strictEqual(params[18], 0, "param[18] should be worstCaseLoss");
  });

});
