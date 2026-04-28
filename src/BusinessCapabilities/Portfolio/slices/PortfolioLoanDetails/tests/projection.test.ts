import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioLoanDetailsSlice } from "../index.js";

describe("Projection: PortfolioLoanDetails", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioLoanDetailsSlice.projectionName, "PortfolioLoanDetails");
  });

  it("LoanRiskAssessed handler returns SQL statements", () => {
    const acquisitionDate = new Date("2025-01-01T11:00:00Z");
    const maturityDate = new Date("2025-01-01T11:00:00Z");
    const payload = {
      portfolioId: "test-portfolioId-001",
      loanId: "test-loanId-001",
      acquisitionDate,
      borrowerName: "test-borrowerName",
      capitalRequirement: 50000,
      creditRating: "test-creditRating",
      expectedLoss: 2500,
      interestRate: 0.05,
      loanAmount: 500000,
      maturityDate,
      probabilityOfDefault: 0.05,
      riskBand: "test-riskBand",
      expectedPortfolioLoss: 12500,
      riskNarrative: "test-riskNarrative",
      simulatedDefaultRate: 0.04,
      tailRiskLoss: 75000,
      worstCaseLoss: 100000,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioLoanDetails" };
    const result = portfolioLoanDetailsSlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');

    const params = result[0].params;
    assert.ok(params.length > 0, 'params should not be empty');

    // $1 = projectionName, $2 = composite key
    assert.strictEqual(params[0], "PortfolioLoanDetails");
    assert.strictEqual(params[1], "test-portfolioId-001:test-loanId-001");

    // $3 = portfolioId, $4 = loanId
    assert.strictEqual(params[2], "test-portfolioId-001");
    assert.strictEqual(params[3], "test-loanId-001");

    // $5 = acquisitionDate as ISO string
    assert.strictEqual(params[4], acquisitionDate.toISOString());

    // $6 = borrowerName
    assert.strictEqual(params[5], "test-borrowerName");

    // $7 = capitalRequirement (numeric)
    assert.strictEqual(params[6], 50000);

    // $8 = creditRating
    assert.strictEqual(params[7], "test-creditRating");

    // $9 = expectedLoss, $10 = interestRate, $11 = loanAmount
    assert.strictEqual(params[8], 2500);
    assert.strictEqual(params[9], 0.05);
    assert.strictEqual(params[10], 500000);

    // $12 = maturityDate as ISO string
    assert.strictEqual(params[11], maturityDate.toISOString());

    // $13 = probabilityOfDefault
    assert.strictEqual(params[12], 0.05);

    // $14 = riskBand
    assert.strictEqual(params[13], "test-riskBand");

    // $15 = expectedPortfolioLoss
    assert.strictEqual(params[14], 12500);

    // $16 = riskNarrative
    assert.strictEqual(params[15], "test-riskNarrative");

    // $17 = simulatedDefaultRate, $18 = tailRiskLoss, $19 = worstCaseLoss
    assert.strictEqual(params[16], 0.04);
    assert.strictEqual(params[17], 75000);
    assert.strictEqual(params[18], 100000);
  });

});
