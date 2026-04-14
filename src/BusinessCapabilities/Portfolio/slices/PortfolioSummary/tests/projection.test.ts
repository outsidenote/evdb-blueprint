import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioSummarySlice } from "../index.js";

describe("Projection: PortfolioSummary", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioSummarySlice.projectionName, "PortfolioSummary");
  });

  it("LoanRiskAssessed handler returns SQL statements", () => {
    // Per-loan event payload for LoanRiskAssessed
    const payload = {
      portfolioId: "PORT-01",
      loanId: "LOAN-001",
      loanAmount: 10000,
      capitalRequirement: 1000,
      expectedLoss: 12,
      expectedPortfolioLoss: 15,
      probabilityOfDefault: 0.05,
      riskWeight: 0.35,        // individual loan risk weight → averageRating "A"
      creditRating: "A",
      borrowerName: "Acme Corp",
      acquisitionDate: new Date("2025-01-01T11:00:00Z"),
      maturityDate: new Date("2030-01-01T11:00:00Z"),
      interestRate: 0.045,
      riskNarrative: "Low risk borrower with strong financials",
      simulatedDefaultRate: 0.03,
      tailRiskLoss: 500,
      worstCaseLoss: 8000,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    assert.ok(result[0].sql.length > 0, "SQL should not be empty");
    assert.ok(result[0].params.length > 0, "params should not be empty");

    // Verify projection name and key are the first two params
    assert.strictEqual(result[0].params[0], "PortfolioSummary", "param $1 should be projectionName");
    assert.strictEqual(result[0].params[1], "PORT-01", "param $2 should be portfolioId key");

    // Verify the initial INSERT payload contains correct aggregate seed values
    const initialPayload = JSON.parse(result[0].params[2] as string);
    assert.strictEqual(initialPayload.totalLoans, 1, "initial totalLoans should be 1");
    assert.strictEqual(initialPayload.totalExposure, 10000, "initial totalExposure should equal loanAmount");
    assert.strictEqual(initialPayload.totalCapitalRequirement, 1000, "initial totalCapitalRequirement should equal capitalRequirement");
    assert.strictEqual(initialPayload.totalExpectedLoss, 12, "initial totalExpectedLoss should equal expectedLoss");
    assert.strictEqual(initialPayload.averageRiskWeight, 0.35, "initial averageRiskWeight should equal riskWeight");
    assert.strictEqual(initialPayload.averageRating, "A", "riskWeight 0.35 → rating A");
    assert.strictEqual(initialPayload.riskBand, "Investment Grade", "riskWeight 0.35 ≤ 0.55 → Investment Grade");
    assert.strictEqual(initialPayload.worstRating, "A", "worstRating should be the first loan's creditRating");
    assert.strictEqual(initialPayload.worstRiskWeight, 0.35, "worstRiskWeight should be the first loan's riskWeight");

    // Verify ON CONFLICT accumulation SQL is present
    assert.ok(result[0].sql.includes("ON CONFLICT"), "SQL should handle conflicts for accumulation");
    assert.ok(result[0].sql.includes("totalLoans"), "SQL should accumulate totalLoans");
    assert.ok(result[0].sql.includes("averageRiskWeight"), "SQL should update averageRiskWeight");
  });

  it("derives averageRating from riskWeight boundaries", () => {
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const base = {
      portfolioId: "PORT-02", loanId: "L-1", loanAmount: 5000, capitalRequirement: 500,
      expectedLoss: 10, expectedPortfolioLoss: 12, probabilityOfDefault: 0.02,
      creditRating: "AA", borrowerName: "Beta", acquisitionDate: "2025-06-01",
      maturityDate: "2028-06-01", interestRate: 0.03, riskNarrative: "safe",
      simulatedDefaultRate: 0.01, tailRiskLoss: 100, worstCaseLoss: 2000,
    };

    const cases: Array<[number, string, string]> = [
      [0.20, "AA", "Investment Grade"],
      [0.30, "A",  "Investment Grade"],
      [0.45, "BBB","Investment Grade"],
      [0.70, "BB", "Speculative"],
      [0.80, "B",  "Speculative"],
    ];

    for (const [riskWeight, expectedRating, expectedBand] of cases) {
      const result = portfolioSummarySlice.handlers.LoanRiskAssessed!({ ...base, riskWeight }, meta)!;
      const initialPayload = JSON.parse(result[0].params[2] as string);
      assert.strictEqual(initialPayload.averageRating, expectedRating, `riskWeight ${riskWeight} → ${expectedRating}`);
      assert.strictEqual(initialPayload.riskBand, expectedBand, `riskWeight ${riskWeight} → ${expectedBand}`);
    }
  });
});
