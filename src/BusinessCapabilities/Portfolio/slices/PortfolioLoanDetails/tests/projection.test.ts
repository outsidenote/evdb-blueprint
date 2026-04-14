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
      capitalRequirement: 1000,
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
  });

});
