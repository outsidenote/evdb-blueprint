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
    const [stmt] = result;
    assert.ok(stmt.sql.length > 0, "SQL should not be empty");
    assert.ok(stmt.sql.includes("ON CONFLICT"), "SQL should include ON CONFLICT clause");
    assert.ok(stmt.sql.includes("totalLoans"), "SQL should reference totalLoans");
    assert.ok(stmt.sql.includes("totalExposure"), "SQL should reference totalExposure");
    assert.ok(stmt.sql.includes("totalCapitalRequirement"), "SQL should reference totalCapitalRequirement");
    assert.ok(stmt.sql.includes("totalExpectedLoss"), "SQL should reference totalExpectedLoss");

    // $1 projectionName, $2 key, $3 portfolioId, $4 loanAmount,
    // $5 capitalRequirement, $6 expectedLoss, $7 riskWeight,
    // $8 probabilityOfDefault, $9 loanRating, $10 riskBand
    assert.strictEqual(stmt.params[0], "PortfolioSummary");
    assert.strictEqual(stmt.params[1], "PORT-01");
    assert.strictEqual(stmt.params[2], "PORT-01");
    assert.strictEqual(stmt.params[3], 10000);
    assert.strictEqual(stmt.params[4], 1000);
    assert.strictEqual(stmt.params[5], 12);
    assert.strictEqual(stmt.params[6], 0.30);
    assert.strictEqual(stmt.params[7], 0.05);
    assert.strictEqual(stmt.params[8], "A");               // riskWeight 0.30 → A (≤0.35)
    assert.strictEqual(stmt.params[9], "Investment Grade"); // riskWeight 0.30 ≤ 0.55
  });

  it("LoanRiskAssessed maps riskWeight 0.80 to rating B and band Speculative", () => {
    const payload = {
      portfolioId: "PORT-02",
      loanAmount: 5000,
      capitalRequirement: 500,
      expectedLoss: 20,
      riskWeight: 0.80,
      probabilityOfDefault: 0.10,
    };
    const meta = { outboxId: "test-id-2", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    const [stmt] = result;
    assert.strictEqual(stmt.params[8], "B");           // riskWeight 0.80 → B (>0.75)
    assert.strictEqual(stmt.params[9], "Speculative"); // riskWeight 0.80 > 0.55
  });

  it("LoanRiskAssessed maps riskWeight 0.25 to rating AA and band Investment Grade", () => {
    const payload = {
      portfolioId: "PORT-03",
      loanAmount: 20000,
      capitalRequirement: 400,
      expectedLoss: 5,
      riskWeight: 0.25,
      probabilityOfDefault: 0.01,
    };
    const meta = { outboxId: "test-id-3", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    const [stmt] = result;
    assert.strictEqual(stmt.params[8], "AA");              // riskWeight 0.25 → AA (≤0.25)
    assert.strictEqual(stmt.params[9], "Investment Grade"); // riskWeight 0.25 ≤ 0.55
  });

  it("LoanRiskAssessed maps riskWeight 0.60 to rating BB and band Speculative", () => {
    const payload = {
      portfolioId: "PORT-04",
      loanAmount: 8000,
      capitalRequirement: 800,
      expectedLoss: 30,
      riskWeight: 0.60,
      probabilityOfDefault: 0.07,
    };
    const meta = { outboxId: "test-id-4", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    const [stmt] = result;
    assert.strictEqual(stmt.params[8], "BB");          // riskWeight 0.60 → BB (≤0.75)
    assert.strictEqual(stmt.params[9], "Speculative"); // riskWeight 0.60 > 0.55
  });
});
