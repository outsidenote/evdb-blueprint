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
      averageProbabilityOfDefault: 5,
      averageRating: "A",
      averageRiskWeight: 0.30,  // decimal risk weight; 0.30 <= 0.35 → rating "A"
      riskBand: "Investment Grade",
      totalCapitalRequirement: 1000,
      totalExpectedLoss: 12,
      totalExposure: 10000,
      totalLoans: 1,
      worstRating: "A",
      acquisitionDate: new Date("2025-01-01T11:00:00Z"),
      borrowerName: "Acme Corp",
      capitalRequirement: 500,
      creditRating: "A",
      expectedLoss: 12,
      expectedPortfolioLoss: 100,
      interestRate: 0.05,
      loanAmount: 10000,
      loanId: "LOAN-001",
      maturityDate: new Date("2030-01-01T00:00:00Z"),
      probabilityOfDefault: 5,
      riskNarrative: "Low risk borrower",
      simulatedDefaultRate: 0.02,
      tailRiskLoss: 800,
      worstCaseLoss: 1200,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    assert.ok(result[0].sql.length > 0, "SQL should not be empty");
    assert.ok(result[0].params.length > 0, "params should not be empty");

    // Param 0: projection name
    assert.strictEqual(result[0].params[0], "PortfolioSummary", "param[0] should be projection name");
    // Param 1: key
    assert.strictEqual(result[0].params[1], "PORT-01", "param[1] should be portfolio key");

    // Param 2: initial payload JSON — verify aggregate seed values
    const initial = JSON.parse(result[0].params[2] as string);
    assert.strictEqual(initial.totalLoans, 1, "first loan seeds totalLoans to 1");
    assert.strictEqual(initial.totalExposure, 10000, "totalExposure seeded from loanAmount");
    assert.strictEqual(initial.totalCapitalRequirement, 500, "totalCapitalRequirement seeded from capitalRequirement");
    assert.strictEqual(initial.totalExpectedLoss, 12, "totalExpectedLoss seeded from expectedLoss");
    assert.strictEqual(initial.averageRiskWeight, 0.30, "averageRiskWeight seeded from per-loan riskWeight");
    assert.strictEqual(initial.averageProbabilityOfDefault, 5, "averagePD seeded from per-loan PD");
    assert.strictEqual(initial.averageRating, "A", "rw=0.30 maps to rating A (≤0.35)");
    assert.strictEqual(initial.riskBand, "Investment Grade", "rw=0.30 maps to Investment Grade (≤0.55)");
    assert.strictEqual(initial.worstRating, "A", "worstRating seeded from first loan creditRating");
    assert.strictEqual(initial._worstRiskWeight, 0.30, "internal worst tracker seeded from rw");

    // SQL structure
    assert.ok(result[0].sql.includes("ON CONFLICT"), "SQL must include ON CONFLICT clause");
    assert.ok(result[0].sql.includes("averageRiskWeight"), "SQL must accumulate averageRiskWeight");
    assert.ok(result[0].sql.includes("NULLIF"), "SQL must guard against division by zero");
  });

  it("LoanRiskAssessed maps riskWeight boundaries to correct ratings", () => {
    const base = {
      portfolioId: "PORT-02",
      borrowerName: "B", loanId: "L", creditRating: "X",
      capitalRequirement: 100, expectedLoss: 5, probabilityOfDefault: 2,
      riskNarrative: "", interestRate: 0.04, loanAmount: 5000,
      maturityDate: new Date(), acquisitionDate: new Date(),
      simulatedDefaultRate: 0, tailRiskLoss: 0, worstCaseLoss: 0, expectedPortfolioLoss: 0,
      // aggregate placeholders (overwritten by handler)
      averageProbabilityOfDefault: 0, averageRating: "", averageRiskWeight: 0,
      riskBand: "", totalCapitalRequirement: 0, totalExpectedLoss: 0,
      totalExposure: 0, totalLoans: 0, worstRating: "",
    };
    const meta = { outboxId: "x", storedAt: new Date(), projectionName: "PortfolioSummary" };

    const cases: [number, string, string][] = [
      [0.20, "AA",  "Investment Grade"],
      [0.25, "AA",  "Investment Grade"],
      [0.30, "A",   "Investment Grade"],
      [0.35, "A",   "Investment Grade"],
      [0.45, "BBB", "Investment Grade"],
      [0.50, "BBB", "Investment Grade"],
      [0.55, "BB",  "Investment Grade"],
      [0.60, "BB",  "Speculative"],
      [0.75, "BB",  "Speculative"],
      [0.80, "B",   "Speculative"],
    ];

    for (const [rw, expectedRating, expectedBand] of cases) {
      const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(
        { ...base, averageRiskWeight: rw }, meta,
      )!;
      const initial = JSON.parse(result[0].params[2] as string);
      assert.strictEqual(initial.averageRating, expectedRating, `rw=${rw} should give rating ${expectedRating}`);
      assert.strictEqual(initial.riskBand, expectedBand, `rw=${rw} should give band ${expectedBand}`);
    }
  });
});
