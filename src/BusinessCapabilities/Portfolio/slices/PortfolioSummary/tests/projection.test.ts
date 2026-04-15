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
      loanAmount: 1000,
      capitalRequirement: 80,
      expectedLoss: 10,
      riskWeight: 0.2,
      probabilityOfDefault: 0.01,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.strictEqual(result[0].params[0], "PortfolioSummary", "first param is projectionName");
    assert.strictEqual(result[0].params[1], "PORT-01", "second param is portfolioId key");
    assert.strictEqual(result[0].params[2], "PORT-01", "third param is portfolioId value");
    assert.strictEqual(result[0].params[3], 1000, "fourth param is loanAmount");
    assert.strictEqual(result[0].params[4], 80, "fifth param is capitalRequirement");
    assert.strictEqual(result[0].params[5], 10, "sixth param is expectedLoss");
    assert.strictEqual(result[0].params[6], 0.2, "seventh param is riskWeight");
    assert.strictEqual(result[0].params[7], 0.01, "eighth param is probabilityOfDefault");
  });

});
