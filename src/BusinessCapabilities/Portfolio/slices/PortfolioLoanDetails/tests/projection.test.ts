import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioLoanDetailsSlice } from "../index.js";

describe("Projection: PortfolioLoanDetails", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioLoanDetailsSlice.projectionName, "PortfolioLoanDetails");
  });

  it("LoanRiskAssessed handler returns SQL statements", () => {
    const payload = {
      portfolioId: "test-portfolioId-001",
      loanId: "test-loanId-001",
      acquisitionDate: new Date("2025-01-01T11:00:00Z"),
      borrowerName: "test-borrowerName",
      capitalRequirement: "test-capitalRequirement",
      creditRating: "test-creditRating",
      expectedLoss: 0,
      interestRate: 0,
      loanAmount: 0,
      maturityDate: new Date("2025-01-01T11:00:00Z"),
      probabilityOfDefault: 0,
      riskBand: "test-riskBand",
      expectedPortfolioLoss: 0,
      riskNarrative: "test-riskNarrative",
      simulatedDefaultRate: 0,
      tailRiskLoss: 0,
      worstCaseLoss: 0,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioLoanDetails" };
    const result = portfolioLoanDetailsSlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.ok(result[0].params.length > 0, 'params should not be empty');

    // $1 = projectionName, $2 = composite key (never cast)
    assert.strictEqual(result[0].params[0], "PortfolioLoanDetails");
    assert.strictEqual(result[0].params[1], "test-portfolioId-001:test-loanId-001");

    // $3–$19 = payload fields inside jsonb_build_object
    assert.strictEqual(result[0].params[2], "test-portfolioId-001");        // portfolioId
    assert.strictEqual(result[0].params[3], "test-loanId-001");             // loanId
    assert.strictEqual(result[0].params[4], "2025-01-01T11:00:00.000Z");    // acquisitionDate ISO string
    assert.strictEqual(result[0].params[5], "test-borrowerName");           // borrowerName
    assert.strictEqual(result[0].params[6], "test-capitalRequirement");     // capitalRequirement
    assert.strictEqual(result[0].params[7], "test-creditRating");           // creditRating
    assert.strictEqual(result[0].params[8], 0);                             // expectedLoss
    assert.strictEqual(result[0].params[9], 0);                             // interestRate
    assert.strictEqual(result[0].params[10], 0);                            // loanAmount
    assert.strictEqual(result[0].params[11], "2025-01-01T11:00:00.000Z");   // maturityDate ISO string
    assert.strictEqual(result[0].params[12], 0);                            // probabilityOfDefault
    assert.strictEqual(result[0].params[13], "test-riskBand");              // riskBand
    assert.strictEqual(result[0].params[14], 0);                            // expectedPortfolioLoss
    assert.strictEqual(result[0].params[15], "test-riskNarrative");         // riskNarrative
    assert.strictEqual(result[0].params[16], 0);                            // simulatedDefaultRate
    assert.strictEqual(result[0].params[17], 0);                            // tailRiskLoss
    assert.strictEqual(result[0].params[18], 0);                            // worstCaseLoss
  });

});
