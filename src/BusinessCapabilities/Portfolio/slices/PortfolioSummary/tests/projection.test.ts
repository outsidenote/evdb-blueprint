import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioSummarySlice } from "../index.js";

describe("Projection: PortfolioSummary", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioSummarySlice.projectionName, "PortfolioSummary");
  });

  it("LoanRiskAssessed handler returns SQL statements", () => {
    // BBB-rated loan: loanAmount=100000, capitalRequirement=4000
    // riskWeight = capitalRequirement / (loanAmount * 0.08) = 4000 / 8000 = 0.5
    // weightedPD = probabilityOfDefault * loanAmount = 0.002 * 100000 = 200
    const payload = {
      portfolioId: "PORT-01",
      loanAmount: 100000,
      capitalRequirement: 4000,
      expectedLoss: 90,
      probabilityOfDefault: 0.002,
      creditRating: "BBB",
      loanId: "LOAN-01",
      borrowerName: "Acme Corp",
      interestRate: 0.05,
      acquisitionDate: new Date("2024-01-01"),
      maturityDate: new Date("2026-01-01"),
      riskBand: "Investment Grade - Medium",
      expectedPortfolioLoss: 90,
      riskNarrative: "BBB loan",
      simulatedDefaultRate: 0.002,
      tailRiskLoss: 100,
      worstCaseLoss: 100,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.includes('ON CONFLICT'), 'SQL should be an UPSERT');
    assert.ok(result[0].params.length > 0, 'params should not be empty');

    // params: [projectionName, key, portfolioId, loanAmount, capitalRequirement, expectedLoss, weightedPD, riskWeight, creditRating]
    const params = result[0].params;
    assert.strictEqual(params[0], "PortfolioSummary");  // $1 projectionName
    assert.strictEqual(params[1], "PORT-01");            // $2 key = portfolioId
    assert.strictEqual(params[2], "PORT-01");            // $3 portfolioId
    assert.strictEqual(params[3], 100000);               // $4 loanAmount
    assert.strictEqual(params[4], 4000);                 // $5 capitalRequirement
    assert.strictEqual(params[5], 90);                   // $6 expectedLoss
    // $7 weightedPD = 0.002 * 100000 = 200
    assert.strictEqual(params[6], 200);
    // $8 riskWeight = 4000 / (100000 * 0.08) = 4000 / 8000 = 0.5
    assert.strictEqual(params[7], 0.5);
    assert.strictEqual(params[8], "BBB");               // $9 creditRating
  });

});
