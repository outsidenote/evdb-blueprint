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
      averageRiskWeight: 0.3,         // per-loan risk weight → 'A' rating, 'Investment Grade'
      riskBand: "Investment Grade",
      totalCapitalRequirement: 1000,
      totalExpectedLoss: 12,
      totalExposure: 10000,
      totalLoans: 2,
      worstRating: "CC",
      acquisitionDate: new Date("2025-01-01T11:00:00Z"),
      borrowerName: "ACME Corp",
      capitalRequirement: 1000,
      creditRating: "A",
      expectedLoss: 12,
      expectedPortfolioLoss: 500,
      interestRate: 0.05,
      loanAmount: 10000,
      loanId: "LOAN-001",
      maturityDate: new Date("2028-01-01T11:00:00Z"),
      probabilityOfDefault: 5,
      riskNarrative: "Low risk borrower",
      simulatedDefaultRate: 0.02,
      tailRiskLoss: 1500,
      worstCaseLoss: 2000,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.ok(result[0].params.length > 0, 'params should not be empty');

    // $1 = projectionName, $2 = key (portfolioId), $3 = initial payload JSON
    assert.strictEqual(result[0].params[0], 'PortfolioSummary', 'param $1 should be projectionName');
    assert.strictEqual(result[0].params[1], 'PORT-01', 'param $2 should be portfolioId as key');

    const initialPayload = JSON.parse(result[0].params[2] as string);
    assert.strictEqual(initialPayload.totalLoans, 1, 'initial totalLoans should be 1');
    assert.strictEqual(initialPayload.totalExposure, 10000, 'initial totalExposure equals loanAmount');
    assert.strictEqual(initialPayload.totalCapitalRequirement, 1000, 'initial totalCapitalRequirement equals capitalRequirement');
    assert.strictEqual(initialPayload.totalExpectedLoss, 12, 'initial totalExpectedLoss equals expectedLoss');
    assert.strictEqual(initialPayload.averageRiskWeight, 0.3, 'initial averageRiskWeight equals per-loan riskWeight');
    assert.strictEqual(initialPayload.averageProbabilityOfDefault, 5, 'initial averagePD equals per-loan probabilityOfDefault');
    assert.strictEqual(initialPayload.averageRating, 'A', 'averageRating derived from riskWeight 0.3 → A');
    assert.strictEqual(initialPayload.riskBand, 'Investment Grade', 'riskBand derived from riskWeight 0.3 → Investment Grade');
    assert.strictEqual(initialPayload.worstRating, 'A', 'worstRating initialized to creditRating of first loan');
    assert.strictEqual(initialPayload.worstRiskWeight, 0.3, 'worstRiskWeight stored for SQL comparisons');
  });

  it("deriving averageRating from riskWeight thresholds", () => {
    const thresholds = [
      { riskWeight: 0.20, expectedRating: 'AA', expectedBand: 'Investment Grade' },
      { riskWeight: 0.25, expectedRating: 'AA', expectedBand: 'Investment Grade' },
      { riskWeight: 0.30, expectedRating: 'A',  expectedBand: 'Investment Grade' },
      { riskWeight: 0.35, expectedRating: 'A',  expectedBand: 'Investment Grade' },
      { riskWeight: 0.45, expectedRating: 'BBB', expectedBand: 'Investment Grade' },
      { riskWeight: 0.50, expectedRating: 'BBB', expectedBand: 'Investment Grade' },
      { riskWeight: 0.55, expectedRating: 'BB',  expectedBand: 'Investment Grade' },
      { riskWeight: 0.60, expectedRating: 'BB',  expectedBand: 'Speculative' },
      { riskWeight: 0.75, expectedRating: 'BB',  expectedBand: 'Speculative' },
      { riskWeight: 0.90, expectedRating: 'B',   expectedBand: 'Speculative' },
    ];

    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };

    for (const { riskWeight, expectedRating, expectedBand } of thresholds) {
      const payload = {
        portfolioId: "PORT-02",
        averageRiskWeight: riskWeight,
        probabilityOfDefault: 0.05,
        loanAmount: 5000,
        capitalRequirement: 500,
        expectedLoss: 10,
        creditRating: "A",
        loanId: "LOAN-TEST",
        borrowerName: "Test Borrower",
        acquisitionDate: new Date("2025-01-01T00:00:00Z"),
        maturityDate: new Date("2027-01-01T00:00:00Z"),
        interestRate: 0.04,
        simulatedDefaultRate: 0.01,
        tailRiskLoss: 100,
        worstCaseLoss: 200,
        expectedPortfolioLoss: 50,
        riskNarrative: "Test",
        // unused aggregate fields
        averageProbabilityOfDefault: 0,
        averageRating: "",
        riskBand: "",
        totalCapitalRequirement: 0,
        totalExpectedLoss: 0,
        totalExposure: 0,
        totalLoans: 0,
        worstRating: "",
      };

      const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;
      const initial = JSON.parse(result[0].params[2] as string);

      assert.strictEqual(
        initial.averageRating,
        expectedRating,
        `riskWeight ${riskWeight} → averageRating '${expectedRating}'`
      );
      assert.strictEqual(
        initial.riskBand,
        expectedBand,
        `riskWeight ${riskWeight} → riskBand '${expectedBand}'`
      );
    }
  });

  it("SQL contains ON CONFLICT DO UPDATE for accumulation", () => {
    const payload = {
      portfolioId: "PORT-03",
      averageRiskWeight: 0.4,
      probabilityOfDefault: 0.03,
      loanAmount: 8000,
      capitalRequirement: 800,
      expectedLoss: 24,
      creditRating: "BBB",
      loanId: "LOAN-002",
      borrowerName: "Beta Corp",
      acquisitionDate: new Date("2025-06-01T00:00:00Z"),
      maturityDate: new Date("2029-06-01T00:00:00Z"),
      interestRate: 0.06,
      simulatedDefaultRate: 0.03,
      tailRiskLoss: 900,
      worstCaseLoss: 1200,
      expectedPortfolioLoss: 300,
      riskNarrative: "Medium risk borrower",
      averageProbabilityOfDefault: 0,
      averageRating: "",
      riskBand: "",
      totalCapitalRequirement: 0,
      totalExpectedLoss: 0,
      totalExposure: 0,
      totalLoans: 0,
      worstRating: "",
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result[0].sql.includes('ON CONFLICT'), 'SQL should handle conflicts for accumulation');
    assert.ok(result[0].sql.includes('totalLoans'), 'SQL should accumulate totalLoans');
    assert.ok(result[0].sql.includes('totalExposure'), 'SQL should accumulate totalExposure');
    assert.ok(result[0].sql.includes('totalCapitalRequirement'), 'SQL should accumulate totalCapitalRequirement');
    assert.ok(result[0].sql.includes('totalExpectedLoss'), 'SQL should accumulate totalExpectedLoss');
    assert.ok(result[0].sql.includes('averageRiskWeight'), 'SQL should update weighted averageRiskWeight');
    assert.ok(result[0].sql.includes('worstRating'), 'SQL should update worstRating');
    assert.ok(result[0].sql.includes('worstRiskWeight'), 'SQL should track worstRiskWeight for comparison');
    assert.ok(result[0].sql.includes('Investment Grade'), 'SQL should derive riskBand');
  });
});
