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
      capitalRequirement: 100,
      creditRating: "test-creditRating",
      expectedLoss: 1.5,
      interestRate: 0.05,
      loanAmount: 50000,
      maturityDate: new Date("2030-01-01T11:00:00Z"),
      probabilityOfDefault: 0.02,
      riskBand: "test-riskBand",
      expectedPortfolioLoss: 750,
      riskNarrative: "test-riskNarrative",
      simulatedDefaultRate: 0.03,
      tailRiskLoss: 2000,
      worstCaseLoss: 5000,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioLoanDetails" };
    const result = portfolioLoanDetailsSlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.ok(result[0].params.length > 0, 'params should not be empty');
    assert.strictEqual(result[0].params[0], "PortfolioLoanDetails", 'first param should be projectionName');
    assert.strictEqual(result[0].params[1], "test-portfolioId-001:test-loanId-001", 'second param should be composite key');
    const storedPayload = JSON.parse(result[0].params[2] as string);
    assert.strictEqual(storedPayload.portfolioId, payload.portfolioId);
    assert.strictEqual(storedPayload.loanId, payload.loanId);
    assert.strictEqual(storedPayload.borrowerName, payload.borrowerName);
    assert.strictEqual(storedPayload.capitalRequirement, payload.capitalRequirement);
    assert.strictEqual(storedPayload.creditRating, payload.creditRating);
    assert.strictEqual(storedPayload.loanAmount, payload.loanAmount);
    assert.strictEqual(storedPayload.riskBand, payload.riskBand);
    assert.strictEqual(storedPayload.riskNarrative, payload.riskNarrative);
  });

});
