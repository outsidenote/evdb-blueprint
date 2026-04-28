import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioSummarySlice } from "../index.js";

describe("Projection: PortfolioSummary", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioSummarySlice.projectionName, "PortfolioSummary");
  });

  it("LoanRiskAssessed handler returns SQL statements", () => {
    // AA loan: riskWeight = 0.25, capitalRequirement = 100000 * 0.25 * 0.08 = 2000
    const payload = {
      portfolioId: "PORT-01",
      loanAmount: 100000,
      capitalRequirement: 2000,
      expectedLoss: 4.5,
      probabilityOfDefault: 0.0001,
      creditRating: "AA",
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.ok(result[0].params.length > 0, 'params should not be empty');

    // $1 = projectionName (varchar)
    assert.strictEqual(result[0].params[0], "PortfolioSummary");
    // $2 = key = portfolioId (varchar)
    assert.strictEqual(result[0].params[1], "PORT-01");
    // $3 = loanAmount
    assert.strictEqual(result[0].params[2], 100000);
    // $4 = capitalRequirement
    assert.strictEqual(result[0].params[3], 2000);
    // $5 = expectedLoss
    assert.strictEqual(result[0].params[4], 4.5);
    // $6 = probabilityOfDefault
    assert.strictEqual(result[0].params[5], 0.0001);
    // $7 = creditRating
    assert.strictEqual(result[0].params[6], "AA");
    // $8 = portfolioId (for jsonb body)
    assert.strictEqual(result[0].params[7], "PORT-01");

    // SQL must be an UPSERT pattern
    assert.ok(result[0].sql.includes("ON CONFLICT"), 'SQL should include ON CONFLICT for UPSERT');
    assert.ok(result[0].sql.includes("DO UPDATE"), 'SQL should include DO UPDATE');
  });

});
