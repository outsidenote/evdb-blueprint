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
      avgPD: "0.5",
      exposure: 1000000,
      loanCount: 2,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioExposure" };
    const result = portfolioExposureSlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.ok(result[0].params.length > 0, 'params should not be empty');
  });

});
