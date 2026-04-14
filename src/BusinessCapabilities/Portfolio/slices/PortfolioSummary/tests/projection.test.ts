import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioSummarySlice } from "../index.js";

describe("Projection: PortfolioSummary", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioSummarySlice.projectionName, "PortfolioSummary");
  });

  it("LoanRiskAssessed handler returns two SQL statements", () => {
    const payload = {
      portfolioId: "PORT-01",
      loanAmount: 100000,
      riskWeight: 0.3,
      probabilityOfDefault: 0.05,
      capitalRequirement: 8000,
      expectedLoss: 1200,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.strictEqual(result.length, 2, "should have two SQL statements: upsert + derived field update");
    assert.ok(result[0].sql.length > 0, "upsert SQL should not be empty");
    assert.ok(result[1].sql.length > 0, "derived field update SQL should not be empty");
  });

  it("LoanRiskAssessed upsert statement has correct params", () => {
    const payload = {
      portfolioId: "PORT-01",
      loanAmount: 100000,
      riskWeight: 0.3,
      probabilityOfDefault: 0.05,
      capitalRequirement: 8000,
      expectedLoss: 1200,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;
    const params = result[0].params;

    assert.strictEqual(params[0], "PortfolioSummary", "$1: projectionName");
    assert.strictEqual(params[1], "PORT-01", "$2: key (portfolioId)");
    assert.strictEqual(params[2], "PORT-01", "$3: portfolioId");
    assert.strictEqual(params[3], 100000, "$4: loanAmount");
    assert.strictEqual(params[4], 8000, "$5: capitalRequirement");
    assert.strictEqual(params[5], 1200, "$6: expectedLoss");
    assert.strictEqual(params[6], 0.3, "$7: riskWeight");
    assert.strictEqual(params[7], 0.05, "$8: probabilityOfDefault");
  });

  it("LoanRiskAssessed derived field update statement has correct params", () => {
    const payload = {
      portfolioId: "PORT-01",
      loanAmount: 100000,
      riskWeight: 0.3,
      probabilityOfDefault: 0.05,
      capitalRequirement: 8000,
      expectedLoss: 1200,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;
    const params = result[1].params;

    assert.strictEqual(params[0], "PortfolioSummary", "$1: projectionName");
    assert.strictEqual(params[1], "PORT-01", "$2: key (portfolioId)");
  });

  it("LoanRiskAssessed upsert SQL contains accumulation logic", () => {
    const payload = {
      portfolioId: "PORT-02",
      loanAmount: 50000,
      riskWeight: 0.6,
      probabilityOfDefault: 0.08,
      capitalRequirement: 4000,
      expectedLoss: 600,
    };
    const meta = { outboxId: "test-id-2", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;
    const sql = result[0].sql;

    assert.ok(sql.includes("ON CONFLICT"), "should have ON CONFLICT upsert clause");
    assert.ok(sql.includes("totalLoans"), "should accumulate totalLoans");
    assert.ok(sql.includes("totalExposure"), "should accumulate totalExposure");
    assert.ok(sql.includes("GREATEST"), "should track worst risk weight with GREATEST");
  });
});
