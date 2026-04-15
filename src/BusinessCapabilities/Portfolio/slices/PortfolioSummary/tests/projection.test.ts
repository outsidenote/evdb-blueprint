import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioSummarySlice } from "../index.js";

describe("Projection: PortfolioSummary", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioSummarySlice.projectionName, "PortfolioSummary");
  });

  it("LoanRiskAssessed handler returns SQL statements", () => {
    // A-rated loan: baseRiskWeight = 0.35 (Basel III RISK_WEIGHT_MAP for A)
    // capitalRequirement = loanAmount × riskWeight × 0.08 = 100000 × 0.35 × 0.08 = 2800
    // PD = 0.0005 (PD_MAP for A), LGD = 0.45
    // expectedLoss = loanAmount × PD × LGD = 100000 × 0.0005 × 0.45 = 22.5
    const payload = {
      portfolioId: "PORT-01",
      loanId: "LOAN-001",
      borrowerName: "Alpha Corp",
      creditRating: "A",
      loanAmount: 100000,
      capitalRequirement: 2800,
      expectedLoss: 22.5,
      probabilityOfDefault: 0.0005,
      interestRate: 0.05,
      acquisitionDate: new Date("2024-01-01"),
      maturityDate: new Date("2026-01-01"),
      riskBand: "Investment Grade - Medium",
      expectedPortfolioLoss: 50,
      riskNarrative: "A rated loan",
      simulatedDefaultRate: 0.001,
      tailRiskLoss: 0,
      worstCaseLoss: 0,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    assert.ok(result[0].sql.length > 0, "SQL should not be empty");

    const params = result[0].params;
    assert.ok(params.length > 0, "params should not be empty");

    // $1 = projectionName
    assert.strictEqual(params[0], "PortfolioSummary");
    // $2 = key = portfolioId
    assert.strictEqual(params[1], "PORT-01");
    // $3 = portfolioId
    assert.strictEqual(params[2], "PORT-01");
    // $4 = loanAmount
    assert.strictEqual(params[3], 100000);
    // $5 = capitalRequirement
    assert.strictEqual(params[4], 2800);
    // $6 = expectedLoss
    assert.strictEqual(params[5], 22.5);
    // $7 = weightedPD = loanAmount × probabilityOfDefault = 100000 × 0.0005 = 50
    assert.strictEqual(params[6], 100000 * 0.0005);
    // $8 = riskWeight = capitalRequirement / (loanAmount × 0.08) = 2800 / (100000 × 0.08) = 0.35
    assert.strictEqual(params[7], 2800 / (100000 * 0.08));
    // $9 = creditRating
    assert.strictEqual(params[8], "A");
  });

});
