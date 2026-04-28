import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioSummarySlice } from "../index.js";

describe("Projection: PortfolioSummary", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioSummarySlice.projectionName, "PortfolioSummary");
  });

  it("LoanRiskAssessed handler returns SQL statements", () => {
    // Event fields from LoanRiskAssessed (what the handler receives)
    // A-rated loan: riskWeight derived as capitalRequirement / (loanAmount * 0.08)
    //   = 28000 / (1000000 * 0.08) = 28000 / 80000 = 0.35
    const payload = {
      portfolioId: "PORT-01",
      loanAmount: 1000000,
      capitalRequirement: 28000,    // 1000000 * 0.35 * 0.08 (A rating, <5yr maturity)
      expectedLoss: 225,            // 1000000 * 0.0005 * 0.45
      probabilityOfDefault: 0.0005, // A rating: 0.05%
      creditRating: "A",
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    assert.ok(result[0].sql.length > 0, "SQL should not be empty");

    // $1 = projectionName (varchar, no cast)
    assert.strictEqual(result[0].params[0], "PortfolioSummary");
    // $2 = portfolioId (key, varchar, no cast)
    assert.strictEqual(result[0].params[1], "PORT-01");
    // $3 = loanAmount → totalExposure accumulation
    assert.strictEqual(result[0].params[2], 1000000);
    // $4 = capitalRequirement → totalCapitalRequirement accumulation
    assert.strictEqual(result[0].params[3], 28000);
    // $5 = expectedLoss → totalExpectedLoss accumulation
    assert.strictEqual(result[0].params[4], 225);
    // $6 = probabilityOfDefault → weighted-average numerator
    assert.strictEqual(result[0].params[5], 0.0005);
    // $7 = riskWeight = 28000 / (1000000 * 0.08) = 0.35
    assert.ok(
      Math.abs((result[0].params[6] as number) - 0.35) < 1e-9,
      "riskWeight should be 0.35",
    );
    // $8 = creditRating → worstRating tracking
    assert.strictEqual(result[0].params[7], "A");
  });
});
