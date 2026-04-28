import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioExposureSlice } from "../index.js";

describe("Projection: PortfolioExposure", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioExposureSlice.projectionName, "PortfolioExposure");
  });

  it("LoanRiskAssessed handler returns SQL statements", () => {
    const payload = {
      creditRating: "AAA",
      portfolioId: "PORT-01",
      probabilityOfDefault: 0.05,
      loanAmount: 500000,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioExposure" };
    const result = portfolioExposureSlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    assert.ok(result[0].sql.length > 0, "SQL should not be empty");
    assert.ok(result[0].params.length > 0, "params should not be empty");

    // Verify params contain correct field values
    const params = result[0].params;
    assert.strictEqual(params[0], "PortfolioExposure", "param $1 should be projectionName");
    // Key: {portfolioId}:{creditRating}
    assert.strictEqual(params[1], "PORT-01:AAA", "param $2 should be key as {portfolioId}:{creditRating}");
    assert.strictEqual(params[2], "AAA", "param $3 should be creditRating");
    assert.strictEqual(params[3], "PORT-01", "param $4 should be portfolioId");
    assert.strictEqual(params[4], 0.05, "param $5 should be probabilityOfDefault");
    assert.strictEqual(params[5], 500000, "param $6 should be loanAmount");
  });
});
