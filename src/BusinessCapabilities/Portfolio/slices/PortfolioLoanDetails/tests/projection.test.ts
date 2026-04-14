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
      capitalRequirement: 12500,
      creditRating: "BBB",
      expectedLoss: 3200,
      interestRate: 4.5,
      loanAmount: 250000,
      maturityDate,
      probabilityOfDefault: 0.032,
      riskBand: "medium",
      expectedPortfolioLoss: 8100,
      riskNarrative: "Moderate risk, stable sector",
      simulatedDefaultRate: 0.028,
      tailRiskLoss: 15000,
      worstCaseLoss: 22000,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioLoanDetails" };
    const result = portfolioLoanDetailsSlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.strictEqual(result[0].params[0], "PortfolioLoanDetails", 'first param should be projection name');
    assert.strictEqual(result[0].params[1], "test-portfolioId-001:test-loanId-001", 'second param should be composite key');
    const storedPayload = JSON.parse(result[0].params[2] as string);
    assert.strictEqual(storedPayload.portfolioId, "test-portfolioId-001", 'portfolioId should be stored');
    assert.strictEqual(storedPayload.loanId, "test-loanId-001", 'loanId should be stored');
    assert.strictEqual(storedPayload.borrowerName, "test-borrowerName", 'borrowerName should be stored');
    assert.strictEqual(storedPayload.capitalRequirement, 12500, 'capitalRequirement should be stored as number');
    assert.strictEqual(storedPayload.creditRating, "BBB", 'creditRating should be stored');
    assert.strictEqual(storedPayload.loanAmount, 250000, 'loanAmount should be stored');
    assert.strictEqual(storedPayload.riskBand, "medium", 'riskBand should be stored');
    assert.strictEqual(storedPayload.expectedPortfolioLoss, 8100, 'expectedPortfolioLoss should be stored');
    assert.strictEqual(storedPayload.riskNarrative, "Moderate risk, stable sector", 'riskNarrative should be stored');
    assert.strictEqual(storedPayload.simulatedDefaultRate, 0.028, 'simulatedDefaultRate should be stored');
    assert.strictEqual(storedPayload.tailRiskLoss, 15000, 'tailRiskLoss should be stored');
    assert.strictEqual(storedPayload.worstCaseLoss, 22000, 'worstCaseLoss should be stored');
  });

});
