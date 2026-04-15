import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioSummarySlice } from "../index.js";

describe("Projection: PortfolioSummary", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioSummarySlice.projectionName, "PortfolioSummary");
  });

  it("LoanRiskAssessed handler SQL params contain correct field values", () => {
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

    assert.ok(result.length > 0, "should have at least one SQL statement");
    assert.ok(result[0].sql.length > 0, "SQL should not be empty");

    const params = result[0].params;
    assert.strictEqual(params[0], "PortfolioSummary", "$1 should be projectionName");
    assert.strictEqual(params[1], "PORT-01", "$2 should be key = portfolioId");
    assert.strictEqual(params[2], "PORT-01", "$3 should be portfolioId");
    assert.strictEqual(params[3], 10000, "$4 should be loanAmount");
    assert.strictEqual(params[4], 1000, "$5 should be capitalRequirement");
    assert.strictEqual(params[5], 120, "$6 should be expectedLoss");
    assert.strictEqual(params[6], 0.30, "$7 should be riskWeight");
    assert.strictEqual(params[7], 0.05, "$8 should be probabilityOfDefault");
  });
});
