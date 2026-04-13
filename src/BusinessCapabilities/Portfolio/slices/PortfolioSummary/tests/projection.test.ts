import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioSummarySlice } from "../index.js";

describe("Projection: PortfolioSummary", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioSummarySlice.projectionName, "PortfolioSummary");
  });

  it("LoanRiskAssessed handler builds correct initial payload and SQL params", () => {
    // BBB loan with 7-year maturity: capitalReq = 1M × 0.575 × 0.08 = 46000 (riskWeight=0.575)
    const payload = {
      portfolioId: "PORT-01",
      acquisitionDate: new Date("2025-01-01T11:00:00Z"),
      borrowerName: "Acme Corp",
      capitalRequirement: 46000,
      creditRating: "BBB",
      expectedLoss: 900,
      expectedPortfolioLoss: 8.5,
      interestRate: 5,
      loanAmount: 1000000,
      loanId: "LOAN-001",
      maturityDate: new Date("2032-01-01T00:00:00Z"),
      probabilityOfDefault: 0.002,
      riskBand: "Speculative - High",
      riskNarrative: "BBB loan ($1000000): Speculative - High.",
      simulatedDefaultRate: 0.0018,
      tailRiskLoss: 200000,
      worstCaseLoss: 450000,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should return at least one SQL statement");
    const stmt = result[0];
    assert.ok(stmt.sql.includes("INSERT INTO projections"), "SQL should contain INSERT");
    assert.ok(stmt.sql.includes("ON CONFLICT"), "SQL should contain ON CONFLICT accumulation");

    // $1: projectionName, $2: key
    assert.strictEqual(stmt.params[0], "PortfolioSummary");
    assert.strictEqual(stmt.params[1], "PORT-01");

    // $3: initial payload — verify accumulated fields for first loan
    const initialPayload = JSON.parse(stmt.params[2] as string);
    assert.strictEqual(initialPayload.portfolioId, "PORT-01");
    assert.strictEqual(initialPayload.totalLoans, 1);
    assert.strictEqual(initialPayload.totalExposure, 1000000);
    assert.strictEqual(initialPayload.totalCapitalRequirement, 46000);
    assert.strictEqual(initialPayload.totalExpectedLoss, 900);
    // riskWeight = 46000 / (1000000 × 0.08) = 0.575
    assert.strictEqual(initialPayload.averageRiskWeight, 0.575);
    assert.strictEqual(initialPayload.averageProbabilityOfDefault, 0.002);
    // 0.575 ≤ 0.75 → "BB"
    assert.strictEqual(initialPayload.averageRating, "BB");
    // 0.575 > 0.55 → "Speculative"
    assert.strictEqual(initialPayload.riskBand, "Speculative");
    assert.strictEqual(initialPayload.worstRating, "BBB");
    assert.strictEqual(initialPayload._worstRiskWeight, 0.575);

    // Accumulation params
    assert.strictEqual(stmt.params[3], 1000000);   // $4: loanAmount
    assert.strictEqual(stmt.params[4], 46000);     // $5: capitalRequirement
    assert.strictEqual(stmt.params[5], 900);       // $6: expectedLoss
    assert.strictEqual(stmt.params[6], 0.575);     // $7: riskWeight
    assert.strictEqual(stmt.params[7], 0.002);     // $8: probabilityOfDefault
    assert.strictEqual(stmt.params[8], "BBB");     // $9: creditRating
  });

  it("derives Investment Grade rating for AAA loan", () => {
    // AAA, short maturity: riskWeight = 0.20, no maturity adj
    // capitalRequirement = 500000 × 0.20 × 0.08 = 8000
    const payload = {
      portfolioId: "PORT-02",
      acquisitionDate: new Date("2025-01-01T11:00:00Z"),
      borrowerName: "Blue Chip",
      capitalRequirement: 8000,
      creditRating: "AAA",
      expectedLoss: 22.5,
      expectedPortfolioLoss: 1.0,
      interestRate: 2,
      loanAmount: 500000,
      loanId: "LOAN-002",
      maturityDate: new Date("2027-01-01T00:00:00Z"),
      probabilityOfDefault: 0.0001,
      riskBand: "Investment Grade - Low",
      riskNarrative: "AAA loan",
      simulatedDefaultRate: 0.0001,
      tailRiskLoss: 100000,
      worstCaseLoss: 150000,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    const stmt = result[0];
    const initialPayload = JSON.parse(stmt.params[2] as string);
    // riskWeight = 8000 / (500000 × 0.08) = 0.20
    assert.strictEqual(initialPayload.averageRiskWeight, 0.20);
    // 0.20 ≤ 0.25 → "AA"
    assert.strictEqual(initialPayload.averageRating, "AA");
    // 0.20 ≤ 0.55 → "Investment Grade"
    assert.strictEqual(initialPayload.riskBand, "Investment Grade");
  });
});
