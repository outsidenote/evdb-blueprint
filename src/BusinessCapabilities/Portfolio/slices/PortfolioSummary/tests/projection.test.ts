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
      averageRiskWeight: "10",
      riskBand: "A",
      totalCapitalRequirement: "1000",
      totalExpectedLoss: 12,
      totalExposure: "10000",
      totalLoans: 2,
      worstRating: "CC",
      acquisitionDate: new Date("2025-01-01T11:00:00Z"),
      borrowerName: "test-borrowerName",
      capitalRequirement: "test-capitalRequirement",
      creditRating: "test-creditRating",
      expectedLoss: 0,
      expectedPortfolioLoss: 0,
      interestRate: 0,
      loanAmount: 0,
      loanId: "test-loanId-001",
      maturityDate: new Date("2025-01-01T11:00:00Z"),
      probabilityOfDefault: 0,
      riskNarrative: "test-riskNarrative",
      simulatedDefaultRate: 0,
      tailRiskLoss: 0,
      worstCaseLoss: 0,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.ok(result[0].params.length > 0, 'params should not be empty');

    // verify correct param values
    assert.strictEqual(result[0].params[0], 'PortfolioSummary', 'params[0] should be projectionName');
    assert.strictEqual(result[0].params[1], 'PORT-01', 'params[1] should be portfolioId key');

    const stored = JSON.parse(result[0].params[2] as string);
    assert.strictEqual(stored.portfolioId, 'PORT-01');
    assert.strictEqual(stored.totalLoans, 2);
    assert.strictEqual(stored.totalExpectedLoss, 12);
    assert.strictEqual(stored.borrowerName, 'test-borrowerName');
    assert.strictEqual(stored.loanId, 'test-loanId-001');
    assert.strictEqual(stored.riskNarrative, 'test-riskNarrative');
    assert.strictEqual(stored.worstRating, 'CC');
    assert.strictEqual(stored.averageRating, 'A');
  });

});
