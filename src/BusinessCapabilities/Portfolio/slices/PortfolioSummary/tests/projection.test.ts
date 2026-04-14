import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioSummarySlice } from "../index.js";

describe("Projection: PortfolioSummary", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioSummarySlice.projectionName, "PortfolioSummary");
  });

  it("LoanRiskAssessed handler returns SQL with correct params for first loan", () => {
    const payload = {
      portfolioId: "PORT-01",
      loanId: "LOAN-001",
      loanAmount: 1000,
      capitalRequirement: 100,
      expectedLoss: 50,
      probabilityOfDefault: 0.05,
      creditRating: "A",
      averageRiskWeight: 0.30, // individual loan's risk weight
      acquisitionDate: new Date("2025-01-01T11:00:00Z"),
      borrowerName: "Acme Corp",
      expectedPortfolioLoss: 0,
      interestRate: 0.06,
      maturityDate: new Date("2030-01-01T00:00:00Z"),
      riskNarrative: "Low risk borrower",
      simulatedDefaultRate: 0.03,
      tailRiskLoss: 200,
      worstCaseLoss: 500,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    assert.ok(result[0].sql.includes("INSERT INTO projections"), "SQL should contain INSERT");
    assert.ok(result[0].sql.includes("ON CONFLICT"), "SQL should handle conflicts");
    assert.ok(result[0].sql.includes("totalLoans"), "SQL should accumulate totalLoans");
    assert.ok(result[0].sql.includes("averageRating"), "SQL should derive averageRating");
    assert.ok(result[0].sql.includes("riskBand"), "SQL should derive riskBand");
    assert.ok(result[0].sql.includes("worstRating"), "SQL should track worstRating");

    // Verify params
    const params = result[0].params;
    assert.strictEqual(params[0], "PortfolioSummary", "param $1 = projectionName");
    assert.strictEqual(params[1], "PORT-01", "param $2 = portfolioId key");

    const initialPayload = JSON.parse(params[2] as string);
    assert.strictEqual(initialPayload.totalLoans, 1, "first loan: totalLoans = 1");
    assert.strictEqual(initialPayload.totalExposure, 1000, "totalExposure = loanAmount");
    assert.strictEqual(initialPayload.totalCapitalRequirement, 100, "totalCapitalRequirement = capitalRequirement");
    assert.strictEqual(initialPayload.totalExpectedLoss, 50, "totalExpectedLoss = expectedLoss");
    assert.strictEqual(initialPayload.averageRiskWeight, 0.30, "averageRiskWeight = loan riskWeight");
    assert.strictEqual(initialPayload.averageProbabilityOfDefault, 0.05, "averageProbabilityOfDefault = loan PD");
    assert.strictEqual(initialPayload.averageRating, "A", "averageRating: 0.30 <= 0.35 → A");
    assert.strictEqual(initialPayload.riskBand, "Investment Grade", "riskBand: 0.30 <= 0.55 → Investment Grade");
    assert.strictEqual(initialPayload.worstRating, "A", "worstRating = creditRating of first loan");
    assert.strictEqual(initialPayload.worstRiskWeight, 0.30, "worstRiskWeight = riskWeight of first loan");

    assert.strictEqual(params[3], 1000, "param $4 = loanAmount");
    assert.strictEqual(params[4], 100, "param $5 = capitalRequirement");
    assert.strictEqual(params[5], 50, "param $6 = expectedLoss");
    assert.strictEqual(params[6], 0.30, "param $7 = riskWeight");
    assert.strictEqual(params[7], 0.05, "param $8 = probabilityOfDefault");
    assert.strictEqual(params[8], "A", "param $9 = creditRating");
  });

  it("deriving averageRating from riskWeight thresholds", () => {
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const basePayload = {
      portfolioId: "PORT-02",
      loanId: "LOAN-002",
      loanAmount: 500,
      capitalRequirement: 50,
      expectedLoss: 10,
      probabilityOfDefault: 0.03,
      creditRating: "AA",
      acquisitionDate: new Date("2025-06-01T00:00:00Z"),
      borrowerName: "Beta LLC",
      expectedPortfolioLoss: 0,
      interestRate: 0.04,
      maturityDate: new Date("2028-01-01T00:00:00Z"),
      riskNarrative: "Prime borrower",
      simulatedDefaultRate: 0.01,
      tailRiskLoss: 100,
      worstCaseLoss: 200,
    };

    const scenarios: Array<{ riskWeight: number; expectedRating: string; expectedBand: string }> = [
      { riskWeight: 0.20, expectedRating: "AA", expectedBand: "Investment Grade" },
      { riskWeight: 0.30, expectedRating: "A", expectedBand: "Investment Grade" },
      { riskWeight: 0.45, expectedRating: "BBB", expectedBand: "Investment Grade" },
      { riskWeight: 0.60, expectedRating: "BB", expectedBand: "Speculative" },
      { riskWeight: 0.90, expectedRating: "B", expectedBand: "Speculative" },
    ];

    for (const { riskWeight, expectedRating, expectedBand } of scenarios) {
      const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(
        { ...basePayload, averageRiskWeight: riskWeight },
        meta,
      )!;
      const initialPayload = JSON.parse(result[0].params[2] as string);
      assert.strictEqual(
        initialPayload.averageRating,
        expectedRating,
        `riskWeight=${riskWeight} → averageRating=${expectedRating}`,
      );
      assert.strictEqual(
        initialPayload.riskBand,
        expectedBand,
        `riskWeight=${riskWeight} → riskBand=${expectedBand}`,
      );
    }
  });
});
