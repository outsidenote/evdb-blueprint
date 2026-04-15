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
      loanAmount: 5000,
      capitalRequirement: 400,
      expectedLoss: 25,
      riskWeight: 0.30,
      probabilityOfDefault: 3,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.ok(result[0].params.length > 0, 'params should not be empty');

    // Verify SQL params contain correct field values from the LoanRiskAssessed event payload
    const params = result[0].params;
    assert.strictEqual(params[0], "PortfolioSummary", 'params[0] should be projectionName');
    assert.strictEqual(params[1], "PORT-01", 'params[1] should be the key (portfolioId)');
    assert.strictEqual(params[2], "PORT-01", 'params[2] should be portfolioId field value');
    assert.strictEqual(params[3], 5000, 'params[3] should be loanAmount');
    assert.strictEqual(params[4], 400, 'params[4] should be capitalRequirement');
    assert.strictEqual(params[5], 25, 'params[5] should be expectedLoss');
    assert.strictEqual(params[6], 0.30, 'params[6] should be riskWeight');
    assert.strictEqual(params[7], 3, 'params[7] should be probabilityOfDefault');
  });

});
