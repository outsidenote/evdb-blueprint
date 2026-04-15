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
      loanAmount: 1000000,
      capitalRequirement: 80000,
      expectedLoss: 5000,
      riskWeight: 0.30,
      probabilityOfDefault: 0.02,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    assert.ok(result[0].sql.length > 0, "SQL should not be empty");
    assert.ok(result[0].params.length > 0, "params should not be empty");

    // params order: $1=projectionName, $2=key(portfolioId), $3=portfolioId,
    //               $4=loanAmount, $5=capitalRequirement, $6=expectedLoss,
    //               $7=riskWeight, $8=probabilityOfDefault
    assert.strictEqual(result[0].params[0], "PortfolioSummary");
    assert.strictEqual(result[0].params[1], "PORT-01");
    assert.strictEqual(result[0].params[2], "PORT-01");
    assert.strictEqual(result[0].params[3], 1000000);
    assert.strictEqual(result[0].params[4], 80000);
    assert.strictEqual(result[0].params[5], 5000);
    assert.strictEqual(result[0].params[6], 0.30);
    assert.strictEqual(result[0].params[7], 0.02);
  });
});
