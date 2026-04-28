import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loanSubmissionStatusSlice } from "../index.js";

describe("Projection: LoanSubmissionStatus", () => {
  it("has correct projection name", () => {
    assert.strictEqual(loanSubmissionStatusSlice.projectionName, "LoanSubmissionStatus");
  });

  it("LoanAddedToPortfolio handler returns SQL statements", () => {
    const maturityDate = new Date("2025-01-01T11:00:00Z");
    const payload = {
      portfolioId: "test-portfolioId-001",
      borrowerName: "test-borrowerName",
      creditRating: "test-creditRating",
      interestRate: 0,
      loanAmount: 0,
      loanId: "test-loanId-001",
      maturityDate,
      errorMessage: "test-errorMessage",
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "LoanSubmissionStatus" };
    const result = loanSubmissionStatusSlice.handlers.LoanAddedToPortfolio!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.ok(result[0].params.length > 0, 'params should not be empty');

    // Verify param positions and values
    assert.strictEqual(result[0].params[0], "LoanSubmissionStatus");       // $1 projectionName
    assert.strictEqual(result[0].params[1], "test-portfolioId-001");        // $2 key = portfolioId
    assert.strictEqual(result[0].params[2], "test-borrowerName");           // $3 borrowerName
    assert.strictEqual(result[0].params[3], "test-creditRating");           // $4 creditRating
    assert.strictEqual(result[0].params[4], 0);                             // $5 interestRate
    assert.strictEqual(result[0].params[5], 0);                             // $6 loanAmount
    assert.strictEqual(result[0].params[6], "test-loanId-001");             // $7 loanId
    assert.strictEqual(result[0].params[7], "2025-01-01T11:00:00.000Z");    // $8 maturityDate as ISO string
    assert.strictEqual(result[0].params[8], "");                            // $9 errorMessage is empty for successful addition
  });

  it("LoanRejectedFromPortfolio handler returns SQL statements", () => {
    const maturityDate = new Date("2025-01-01T11:00:00Z");
    const payload = {
      portfolioId: "test-portfolioId-001",
      borrowerName: "test-borrowerName",
      creditRating: "test-creditRating",
      interestRate: 0,
      loanAmount: 0,
      loanId: "test-loanId-001",
      maturityDate,
      errorMessage: "test-errorMessage",
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "LoanSubmissionStatus" };
    const result = loanSubmissionStatusSlice.handlers.LoanRejectedFromPortfolio!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.ok(result[0].params.length > 0, 'params should not be empty');

    // Verify param positions and values
    assert.strictEqual(result[0].params[0], "LoanSubmissionStatus");       // $1 projectionName
    assert.strictEqual(result[0].params[1], "test-portfolioId-001");        // $2 key = portfolioId
    assert.strictEqual(result[0].params[2], "test-borrowerName");           // $3 borrowerName
    assert.strictEqual(result[0].params[3], "test-creditRating");           // $4 creditRating
    assert.strictEqual(result[0].params[4], 0);                             // $5 interestRate
    assert.strictEqual(result[0].params[5], 0);                             // $6 loanAmount
    assert.strictEqual(result[0].params[6], "test-loanId-001");             // $7 loanId
    assert.strictEqual(result[0].params[7], "2025-01-01T11:00:00.000Z");    // $8 maturityDate as ISO string
    assert.strictEqual(result[0].params[8], "test-errorMessage");           // $9 errorMessage from rejection event
  });

});
