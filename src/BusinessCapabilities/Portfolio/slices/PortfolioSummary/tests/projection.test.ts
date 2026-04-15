import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioSummarySlice } from "../index.js";

describe("Projection: PortfolioSummary", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioSummarySlice.projectionName, "PortfolioSummary");
  });

  it("LoanRiskAssessed handler returns SQL statements", () => {
    const payload = {
      portfolioId: "PORT-01",
      averageProbabilityOfDefault: 5,
      averageRating: "A",
      averageRiskWeight: "10",
      riskBand: "A",
      totalCapitalRequirement: "1000",
      totalExpectedLoss: 12,
      totalExposure: "10000",
      totalLoans: 2,
      worstRating: "CC",
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.ok(result[0].params.length > 0, 'params should not be empty');
  });

});
