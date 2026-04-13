import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioLoanDetailsSlice } from "../index.js";

describe("Projection: PortfolioLoanDetails", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioLoanDetailsSlice.projectionName, "PortfolioLoanDetails");
  });

  it("LoanRiskAssessed handler returns UPSERT with composite key and correct params", () => {
    const payload = {
      portfolioId: "PORT-01",
      loanId: "loan-001",
      acquisitionDate: new Date("2025-01-01T11:00:00Z"),
      borrowerName: "Acme Corp",
      capitalRequirement: 40000,
      creditRating: "BBB",
      expectedLoss: 900,
      interestRate: 0.05,
      loanAmount: 1000000,
      maturityDate: new Date("2032-01-01T11:00:00Z"),
      probabilityOfDefault: 0.002,
      riskBand: "Investment Grade - Medium",
      expectedPortfolioLoss: 850,
      riskNarrative: "BBB loan ($1000000): Investment Grade - Medium",
      simulatedDefaultRate: 0.002,
      tailRiskLoss: 120000,
      worstCaseLoss: 450000,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioLoanDetails" };
    const result = portfolioLoanDetailsSlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    const stmt = result[0];
    assert.ok(stmt.sql.includes("INSERT INTO projections"), "SQL should be an UPSERT");
    assert.ok(stmt.sql.includes("ON CONFLICT"), "SQL should handle conflict");
    assert.ok(stmt.sql.includes("EXCLUDED.payload"), "ON CONFLICT should overwrite with EXCLUDED.payload");

    // params: [projectionName, compositeKey, payloadJson]
    assert.strictEqual(stmt.params[0], "PortfolioLoanDetails");
    assert.strictEqual(stmt.params[1], "PORT-01:loan-001"); // composite key
    assert.strictEqual(stmt.params.length, 3);

    // payload should contain all relevant loan fields
    const storedPayload = JSON.parse(stmt.params[2] as string);
    assert.strictEqual(storedPayload.portfolioId, "PORT-01");
    assert.strictEqual(storedPayload.loanId, "loan-001");
    assert.strictEqual(storedPayload.borrowerName, "Acme Corp");
    assert.strictEqual(storedPayload.creditRating, "BBB");
    assert.strictEqual(storedPayload.loanAmount, 1000000);
    assert.strictEqual(storedPayload.capitalRequirement, 40000);
    assert.strictEqual(storedPayload.riskBand, "Investment Grade - Medium");
    assert.strictEqual(storedPayload.riskNarrative, "BBB loan ($1000000): Investment Grade - Medium");
  });

});
