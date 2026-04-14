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
      expectedLoss: 120,
      riskWeight: 0.30,
      probabilityOfDefault: 0.05,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.ok(result[0].params.length > 0, 'params should not be empty');

    assert.strictEqual(result[0].params[0], "PortfolioSummary", "param $1 should be projectionName");
    assert.strictEqual(result[0].params[1], "PORT-01", "param $2 should be portfolioId key");
    assert.strictEqual(result[0].params[2], "PORT-01", "param $3 should be portfolioId field");
    assert.strictEqual(result[0].params[3], 10000, "param $4 should be loanAmount");
    assert.strictEqual(result[0].params[4], 1000, "param $5 should be capitalRequirement");
    assert.strictEqual(result[0].params[5], 120, "param $6 should be expectedLoss");
    assert.strictEqual(result[0].params[6], 0.30, "param $7 should be riskWeight");
    assert.strictEqual(result[0].params[7], 0.05, "param $8 should be probabilityOfDefault");
    assert.strictEqual(result[0].params[8], 3000, "param $9 should be weightedRiskWeight (riskWeight * loanAmount)");
    assert.strictEqual(result[0].params[9], 500, "param $10 should be weightedPD (probabilityOfDefault * loanAmount)");
  });

});
