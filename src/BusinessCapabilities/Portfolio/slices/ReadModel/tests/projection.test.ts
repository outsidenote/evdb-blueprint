import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readModelSlice } from "../index.js";

describe("Projection: LoansPendingRiskAssess", () => {
  it("has correct projection name", () => {
    assert.strictEqual(readModelSlice.projectionName, "LoansPendingRiskAssess");
  });

  it("LoanAddedToPortfolio handler returns SQL statements", () => {
    const payload = {
      portfolioId: "PORT-01",
      loanId: "LOAN-001",
      acquisitionDate: new Date("2025-01-15T10:00:00Z"),
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 4.5,
      loanAmount: 250000,
      maturityDate: new Date("2030-01-15T00:00:00Z"),
    };
    const meta = {
      outboxId: "test-id",
      storedAt: new Date(),
      projectionName: "LoansPendingRiskAssess",
    };
    const result = readModelSlice.handlers.LoanAddedToPortfolio!(payload, meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    assert.ok(result[0].sql.length > 0, "SQL should not be empty");
    assert.ok(result[0].params.length > 0, "params should not be empty");
    assert.strictEqual(result[0].params[0], "LoansPendingRiskAssess");
    assert.strictEqual(result[0].params[1], "PORT-01:LOAN-001");
  });
});
