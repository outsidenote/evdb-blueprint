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
      loanAmount: 500000,
      capitalRequirement: 40000,
      expectedLoss: 2500,
      riskWeight: 0.30,
      probabilityOfDefault: 0.02,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    assert.ok(result[0].sql.length > 0, "SQL should not be empty");
    assert.ok(result[0].params.length > 0, "params should not be empty");

    assert.strictEqual(result[0].params[0], "PortfolioSummary"); // projectionName
    assert.strictEqual(result[0].params[1], "PORT-01");          // key (portfolioId)
    assert.strictEqual(result[0].params[2], "PORT-01");          // portfolioId field
    assert.strictEqual(result[0].params[3], 500000);             // loanAmount
    assert.strictEqual(result[0].params[4], 40000);              // capitalRequirement
    assert.strictEqual(result[0].params[5], 2500);               // expectedLoss
    assert.strictEqual(result[0].params[6], 0.30);               // riskWeight
    assert.strictEqual(result[0].params[7], 0.02);               // probabilityOfDefault
  });

});
