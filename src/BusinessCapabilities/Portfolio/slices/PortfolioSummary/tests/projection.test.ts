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
      loanAmount: 1000000,
      capitalRequirement: 80000,
      expectedLoss: 5000,
      riskWeight: 0.30,
      probabilityOfDefault: 0.02,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.includes('ON CONFLICT'), 'SQL should be an UPSERT');
    assert.strictEqual(result[0].params[0], "PortfolioSummary", 'first param should be projection name');
    assert.strictEqual(result[0].params[1], "PORT-01", 'second param should be the key (portfolioId)');
    assert.strictEqual(result[0].params[2], "PORT-01", 'third param should be portfolioId');
    assert.strictEqual(result[0].params[3], 1000000, 'fourth param should be loanAmount');
    assert.strictEqual(result[0].params[4], 80000, 'fifth param should be capitalRequirement');
    assert.strictEqual(result[0].params[5], 5000, 'sixth param should be expectedLoss');
    assert.strictEqual(result[0].params[6], 0.30, 'seventh param should be riskWeight');
    assert.strictEqual(result[0].params[7], 0.02, 'eighth param should be probabilityOfDefault');
  });

});
