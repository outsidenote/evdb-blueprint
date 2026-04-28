import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loanSubmissionStatusSlice } from "../index.js";

describe("Projection: LoanSubmissionStatus", () => {
  it("has correct projection name", () => {
    assert.strictEqual(loanSubmissionStatusSlice.projectionName, "LoanSubmissionStatus");
  });

  it("LoanAddedToPortfolio handler returns SQL statements", () => {
    const payload = {
      portfolioId: "test-portfolioId-001",
      borrowerName: "test-borrowerName",
      creditRating: "test-creditRating",
      interestRate: 0,
      loanAmount: 0,
      loanId: "test-loanId-001",
      maturityDate: new Date("2025-01-01T11:00:00Z"),
      errorMessage: "test-errorMessage",
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "LoanSubmissionStatus" };
    const result = loanSubmissionStatusSlice.handlers.LoanAddedToPortfolio!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.ok(result[0].params.length > 0, 'params should not be empty');
  });

  it("LoanRejectedFromPortfolio handler returns SQL statements", () => {
    const payload = {
      portfolioId: "test-portfolioId-001",
      borrowerName: "test-borrowerName",
      creditRating: "test-creditRating",
      interestRate: 0,
      loanAmount: 0,
      loanId: "test-loanId-001",
      maturityDate: new Date("2025-01-01T11:00:00Z"),
      errorMessage: "test-errorMessage",
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "LoanSubmissionStatus" };
    const result = loanSubmissionStatusSlice.handlers.LoanRejectedFromPortfolio!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.ok(result[0].params.length > 0, 'params should not be empty');
  });

});
