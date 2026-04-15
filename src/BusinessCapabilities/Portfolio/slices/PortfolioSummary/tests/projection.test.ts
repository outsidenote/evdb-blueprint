import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioSummarySlice } from "../index.js";

describe("Projection: PortfolioSummary", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioSummarySlice.projectionName, "PortfolioSummary");
  });

  it("LoanRiskAssessed handler returns SQL statements with correct params", () => {
    const payload = {
      portfolioId: "PORT-01",
      loanAmount: 10000,
      capitalRequirement: 1000,
      expectedLoss: 12,
      riskWeight: 0.35,
      probabilityOfDefault: 0.05,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    assert.ok(result[0].sql.length > 0, "SQL should not be empty");

    const params = result[0].params;
    assert.strictEqual(params[0], "PortfolioSummary", "param $1: projectionName");
    assert.strictEqual(params[1], "PORT-01", "param $2: key = portfolioId");
    assert.strictEqual(params[2], "PORT-01", "param $3: portfolioId");
    assert.strictEqual(params[3], 10000, "param $4: loanAmount");
    assert.strictEqual(params[4], 1000, "param $5: capitalRequirement");
    assert.strictEqual(params[5], 12, "param $6: expectedLoss");
    assert.strictEqual(params[6], 0.35, "param $7: riskWeight");
    assert.strictEqual(params[7], 0.05, "param $8: probabilityOfDefault");
  });
});
