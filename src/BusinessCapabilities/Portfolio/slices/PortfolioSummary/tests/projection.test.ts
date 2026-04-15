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
      loanAmount: 100000,
      riskWeight: 0.30,
      probabilityOfDefault: 0.02,
      capitalRequirement: 5000,
      expectedLoss: 2000,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    assert.ok(result[0].sql.includes("INSERT INTO projections"), "SQL should be an INSERT statement");
    assert.ok(result[0].sql.includes("ON CONFLICT"), "SQL should handle conflicts for accumulation");

    // params: [projectionName, key, portfolioId, loanAmount, riskWeight, probabilityOfDefault, capitalRequirement, expectedLoss]
    assert.strictEqual(result[0].params[0], "PortfolioSummary"); // projectionName
    assert.strictEqual(result[0].params[1], "PORT-01");          // key = portfolioId
    assert.strictEqual(result[0].params[2], "PORT-01");          // portfolioId field
    assert.strictEqual(result[0].params[3], 100000);             // loanAmount ($4)
    assert.strictEqual(result[0].params[4], 0.30);               // riskWeight ($5)
    assert.strictEqual(result[0].params[5], 0.02);               // probabilityOfDefault ($6)
    assert.strictEqual(result[0].params[6], 5000);               // capitalRequirement ($7)
    assert.strictEqual(result[0].params[7], 2000);               // expectedLoss ($8)
  });
});
