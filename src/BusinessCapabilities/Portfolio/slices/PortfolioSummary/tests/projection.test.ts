import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioSummarySlice } from "../index.js";

describe("Projection: PortfolioSummary", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioSummarySlice.projectionName, "PortfolioSummary");
  });

  it("LoanRiskAssessed handler returns UPSERT SQL with correct params", () => {
    const payload = {
      portfolioId: "PORT-01",
      averageProbabilityOfDefault: 0,
      averageRating: "",
      averageRiskWeight: 0,
      riskBand: "",
      totalCapitalRequirement: 0,
      totalExpectedLoss: 0,
      totalExposure: 0,
      totalLoans: 0,
      worstRating: "",
      acquisitionDate: new Date("2025-01-01T11:00:00Z"),
      borrowerName: "Acme Corp",
      capitalRequirement: 40000,
      creditRating: "BBB",
      expectedLoss: 900,
      expectedPortfolioLoss: 850,
      interestRate: 0.05,
      loanAmount: 1000000,
      loanId: "loan-001",
      maturityDate: new Date("2032-01-01T11:00:00Z"),
      probabilityOfDefault: 0.002,
      riskNarrative: "BBB loan ($1000000): Speculative - High",
      simulatedDefaultRate: 0.002,
      tailRiskLoss: 120000,
      worstCaseLoss: 450000,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    const stmt = result[0];
    assert.ok(stmt.sql.includes("INSERT INTO projections"), "SQL should be an UPSERT");
    assert.ok(stmt.sql.includes("ON CONFLICT"), "SQL should handle conflict");
    assert.ok(stmt.sql.includes("totalLoans"), "SQL should accumulate totalLoans");
    assert.ok(stmt.sql.includes("totalExposure"), "SQL should accumulate totalExposure");
    assert.ok(stmt.sql.includes("averageRiskWeight"), "SQL should compute averageRiskWeight");
    assert.ok(stmt.sql.includes("worstRating"), "SQL should track worstRating");

    // params: [projectionName, key, initialPayload, loanAmount, capitalReq, expectedLoss, riskWeight, creditRating]
    assert.strictEqual(stmt.params[0], "PortfolioSummary");
    assert.strictEqual(stmt.params[1], "PORT-01");
    assert.strictEqual(stmt.params[3], 1000000);   // loanAmount
    assert.strictEqual(stmt.params[4], 40000);     // capitalRequirement
    assert.strictEqual(stmt.params[5], 900);       // expectedLoss
    assert.strictEqual(stmt.params[7], "BBB");     // creditRating

    // initial payload should include aggregate starting fields
    const initialPayload = JSON.parse(stmt.params[2] as string);
    assert.strictEqual(initialPayload.portfolioId, "PORT-01");
    assert.strictEqual(initialPayload.totalLoans, 1);
    assert.strictEqual(initialPayload.totalExposure, 1000000);
    assert.strictEqual(initialPayload.totalCapitalRequirement, 40000);
    assert.strictEqual(initialPayload.totalExpectedLoss, 900);
    assert.strictEqual(initialPayload.worstRating, "BBB");
    // riskWeight = 40000 / (1000000 * 0.08) = 0.5 → BBB
    assert.ok(Math.abs(initialPayload.averageRiskWeight - 0.5) < 0.001);
    assert.strictEqual(initialPayload.averageRating, "BBB");
    assert.strictEqual(initialPayload.riskBand, "Investment Grade");
  });
});
