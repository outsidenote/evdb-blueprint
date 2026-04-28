import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioLoanDetailsSlice } from "../index.js";

describe("Projection: PortfolioLoanDetails", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioLoanDetailsSlice.projectionName, "PortfolioLoanDetails");
  });

  it("LoanRiskAssessed handler returns SQL statements", () => {
    const acquisitionDate = new Date("2025-01-01T11:00:00Z");
    const maturityDate = new Date("2030-06-01T00:00:00Z");
    const payload = {
      portfolioId: "test-portfolioId-001",
      loanId: "test-loanId-001",
      acquisitionDate,
      borrowerName: "test-borrowerName",
      capitalRequirement: 50000,
      creditRating: "test-creditRating",
      expectedLoss: 5000,
      interestRate: 0.045,
      loanAmount: 500000,
      maturityDate,
      probabilityOfDefault: 0.02,
      riskBand: "test-riskBand",
      expectedPortfolioLoss: 10000,
      riskNarrative: "test-riskNarrative",
      simulatedDefaultRate: 0.025,
      tailRiskLoss: 75000,
      worstCaseLoss: 100000,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioLoanDetails" };
    const result = portfolioLoanDetailsSlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    assert.ok(result[0].sql.length > 0, "SQL should not be empty");
    assert.ok(result[0].params.length > 0, "params should not be empty");

    const params = result[0].params;
    // $1 = projectionName (index 0)
    assert.strictEqual(params[0], "PortfolioLoanDetails", "params[0] should be projectionName");
    // $2 = composite key portfolioId:loanId (index 1)
    assert.strictEqual(params[1], "test-portfolioId-001:test-loanId-001", "params[1] should be composite key");
    // $3 = portfolioId (index 2)
    assert.strictEqual(params[2], "test-portfolioId-001", "params[2] should be portfolioId");
    // $4 = loanId (index 3)
    assert.strictEqual(params[3], "test-loanId-001", "params[3] should be loanId");
    // $5 = acquisitionDate ISO string (index 4)
    assert.strictEqual(params[4], acquisitionDate.toISOString(), "params[4] should be acquisitionDate ISO string");
    // $6 = borrowerName (index 5)
    assert.strictEqual(params[5], "test-borrowerName", "params[5] should be borrowerName");
    // $7 = capitalRequirement (index 6)
    assert.strictEqual(params[6], 50000, "params[6] should be capitalRequirement");
    // $8 = creditRating (index 7)
    assert.strictEqual(params[7], "test-creditRating", "params[7] should be creditRating");
    // $9 = expectedLoss (index 8)
    assert.strictEqual(params[8], 5000, "params[8] should be expectedLoss");
    // $10 = interestRate (index 9)
    assert.strictEqual(params[9], 0.045, "params[9] should be interestRate");
    // $11 = loanAmount (index 10)
    assert.strictEqual(params[10], 500000, "params[10] should be loanAmount");
    // $12 = maturityDate ISO string (index 11)
    assert.strictEqual(params[11], maturityDate.toISOString(), "params[11] should be maturityDate ISO string");
    // $13 = probabilityOfDefault (index 12)
    assert.strictEqual(params[12], 0.02, "params[12] should be probabilityOfDefault");
    // $14 = riskBand (index 13)
    assert.strictEqual(params[13], "test-riskBand", "params[13] should be riskBand");
    // $15 = expectedPortfolioLoss (index 14)
    assert.strictEqual(params[14], 10000, "params[14] should be expectedPortfolioLoss");
    // $16 = riskNarrative (index 15)
    assert.strictEqual(params[15], "test-riskNarrative", "params[15] should be riskNarrative");
    // $17 = simulatedDefaultRate (index 16)
    assert.strictEqual(params[16], 0.025, "params[16] should be simulatedDefaultRate");
    // $18 = tailRiskLoss (index 17)
    assert.strictEqual(params[17], 75000, "params[17] should be tailRiskLoss");
    // $19 = worstCaseLoss (index 18)
    assert.strictEqual(params[18], 100000, "params[18] should be worstCaseLoss");
  });

});
