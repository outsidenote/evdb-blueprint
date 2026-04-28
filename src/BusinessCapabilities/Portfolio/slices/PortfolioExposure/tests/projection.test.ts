import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioExposureSlice } from "../index.js";

describe("Projection: PortfolioExposure", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioExposureSlice.projectionName, "PortfolioExposure");
  });

  it("LoanRiskAssessed handler returns SQL with correct params", () => {
    const payload = {
      creditRating: "AAA",
      portfolioId: "PORT-01",
      probabilityOfDefault: 0.05,
      loanAmount: 1000000,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioExposure" };
    const result = portfolioExposureSlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    assert.ok(result[0].sql.length > 0, "SQL should not be empty");
    // $1 = projectionName, $2 = key, $3 = creditRating, $4 = portfolioId, $5 = probabilityOfDefault, $6 = loanAmount
    assert.strictEqual(result[0].params[0], "PortfolioExposure");
    assert.strictEqual(result[0].params[1], "PORT-01:AAA");
    assert.strictEqual(result[0].params[2], "AAA");
    assert.strictEqual(result[0].params[3], "PORT-01");
    assert.strictEqual(result[0].params[4], 0.05);
    assert.strictEqual(result[0].params[5], 1000000);
  });
});
