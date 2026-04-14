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
      capitalRequirement: 800,
      expectedLoss: 200,
      riskWeight: 0.20,
      probabilityOfDefault: 0.02,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    assert.ok(result[0].sql.length > 0, "SQL should not be empty");
    assert.ok(result[0].sql.includes("ON CONFLICT"), "SQL should contain UPSERT logic");
    assert.ok(result[0].sql.includes("jsonb_build_object"), "SQL should use jsonb_build_object");
    assert.strictEqual(result[0].params[0], "PortfolioSummary", "param $1 should be projectionName");
    assert.strictEqual(result[0].params[1], "PORT-01", "param $2 should be portfolioId key");
    assert.strictEqual(result[0].params[2], 10000, "param $3 should be loanAmount");
    assert.strictEqual(result[0].params[3], 800, "param $4 should be capitalRequirement");
    assert.strictEqual(result[0].params[4], 200, "param $5 should be expectedLoss");
    assert.strictEqual(result[0].params[5], 0.20, "param $6 should be riskWeight");
    assert.strictEqual(result[0].params[6], 0.02, "param $7 should be probabilityOfDefault");
  });

});
