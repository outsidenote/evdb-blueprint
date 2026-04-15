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
      loanAmount: 10000,
      capitalRequirement: 1000,
      expectedLoss: 12,
      riskWeight: 0.30,
      probabilityOfDefault: 0.05,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.ok(result[0].params.length > 0, 'params should not be empty');
    assert.strictEqual(result[0].params[0], "PortfolioSummary", "params[0] should be projection name");
    assert.strictEqual(result[0].params[1], "PORT-01", "params[1] should be the portfolio key");
    assert.strictEqual(result[0].params[2], "PORT-01", "params[2] should be portfolioId");
    assert.strictEqual(result[0].params[3], 10000, "params[3] should be loanAmount");
    assert.strictEqual(result[0].params[4], 1000, "params[4] should be capitalRequirement");
    assert.strictEqual(result[0].params[5], 12, "params[5] should be expectedLoss");
    assert.strictEqual(result[0].params[6], 0.30, "params[6] should be riskWeight");
    assert.strictEqual(result[0].params[7], 0.05, "params[7] should be probabilityOfDefault");
  });

});
