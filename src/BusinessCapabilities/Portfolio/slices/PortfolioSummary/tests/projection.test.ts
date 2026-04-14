import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioSummarySlice } from "../index.js";

describe("Projection: PortfolioSummary", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioSummarySlice.projectionName, "PortfolioSummary");
  });

  it("LoanRiskAssessed handler returns SQL with correct params", () => {
    const payload = {
      portfolioId: "PORT-01",
      loanAmount: 10000,
      capitalRequirement: 1000,
      expectedLoss: 12,
      riskWeight: 0.30,
      probabilityOfDefault: 0.05,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    const { sql, params } = result[0];
    assert.ok(sql.length > 0, "SQL should not be empty");
    assert.ok(params.length > 0, "params should not be empty");

    assert.strictEqual(params[0], "PortfolioSummary", "param $1 should be projectionName");
    assert.strictEqual(params[1], "PORT-01", "param $2 should be portfolioId (key)");
    assert.strictEqual(params[2], "PORT-01", "param $3 should be portfolioId");
    assert.strictEqual(params[3], 10000, "param $4 should be loanAmount");
    assert.strictEqual(params[4], 1000, "param $5 should be capitalRequirement");
    assert.strictEqual(params[5], 12, "param $6 should be expectedLoss");
    assert.strictEqual(params[6], 0.30, "param $7 should be riskWeight");
    assert.strictEqual(params[7], 0.05, "param $8 should be probabilityOfDefault");
  });

  it("SQL contains accumulation logic for all running totals", () => {
    const payload = {
      portfolioId: "PORT-02",
      loanAmount: 5000,
      capitalRequirement: 500,
      expectedLoss: 6,
      riskWeight: 0.40,
      probabilityOfDefault: 0.03,
    };
    const meta = { outboxId: "test-id-2", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    const { sql } = result[0];
    assert.ok(sql.includes("totalLoans"), "SQL should reference totalLoans");
    assert.ok(sql.includes("totalExposure"), "SQL should reference totalExposure");
    assert.ok(sql.includes("totalCapitalRequirement"), "SQL should reference totalCapitalRequirement");
    assert.ok(sql.includes("totalExpectedLoss"), "SQL should reference totalExpectedLoss");
    assert.ok(sql.includes("averageRiskWeight"), "SQL should reference averageRiskWeight");
    assert.ok(sql.includes("averageProbabilityOfDefault"), "SQL should reference averageProbabilityOfDefault");
    assert.ok(sql.includes("averageRating"), "SQL should reference averageRating");
    assert.ok(sql.includes("riskBand"), "SQL should reference riskBand");
    assert.ok(sql.includes("worstRating"), "SQL should reference worstRating");
  });

  it("SQL contains weighted average and ON CONFLICT upsert logic", () => {
    const payload = {
      portfolioId: "PORT-03",
      loanAmount: 8000,
      capitalRequirement: 800,
      expectedLoss: 10,
      riskWeight: 0.20,
      probabilityOfDefault: 0.02,
    };
    const meta = { outboxId: "test-id-3", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    const { sql } = result[0];
    assert.ok(sql.includes("ON CONFLICT"), "SQL should have ON CONFLICT upsert clause");
    assert.ok(sql.includes("Investment Grade"), "SQL should reference Investment Grade riskBand value");
    assert.ok(sql.includes("Speculative"), "SQL should reference Speculative riskBand value");
    assert.ok(sql.includes("projections.payload"), "SQL should read existing payload for accumulation");
  });

  it("SQL uses explicit type casts inside jsonb_build_object", () => {
    const payload = {
      portfolioId: "PORT-04",
      loanAmount: 2000,
      capitalRequirement: 200,
      expectedLoss: 4,
      riskWeight: 0.60,
      probabilityOfDefault: 0.08,
    };
    const meta = { outboxId: "test-id-4", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    const { sql } = result[0];
    assert.ok(sql.includes("::text"), "SQL should cast text params explicitly");
    assert.ok(sql.includes("::numeric"), "SQL should cast numeric params explicitly");
  });
});
