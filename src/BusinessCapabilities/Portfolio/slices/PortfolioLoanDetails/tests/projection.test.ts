import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioLoanDetailsSlice } from "../index.js";

describe("Projection: PortfolioLoanDetails", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioLoanDetailsSlice.projectionName, "PortfolioLoanDetails");
  });

  it("LoanRiskAssessed handler stores per-loan details with composite key", () => {
    const payload = {
      portfolioId: "PORT-001",
      loanId: "LOAN-001",
      acquisitionDate: new Date("2025-01-01T11:00:00Z"),
      borrowerName: "Acme Corp",
      capitalRequirement: 46000,
      creditRating: "BBB",
      expectedLoss: 900,
      interestRate: 5,
      loanAmount: 1000000,
      maturityDate: new Date("2032-01-01T00:00:00Z"),
      probabilityOfDefault: 0.002,
      riskBand: "Speculative - High",
      expectedPortfolioLoss: 8.5,
      riskNarrative: "BBB loan ($1000000): Speculative - High.",
      simulatedDefaultRate: 0.0018,
      tailRiskLoss: 200000,
      worstCaseLoss: 450000,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioLoanDetails" };
    const result = portfolioLoanDetailsSlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should return at least one SQL statement");
    const stmt = result[0];
    assert.ok(stmt.sql.includes("INSERT INTO projections"), "SQL should contain INSERT");
    assert.ok(stmt.sql.includes("EXCLUDED.payload"), "SQL should use EXCLUDED.payload for overwrite");

    // $1: projectionName, $2: composite key, $3: payload
    assert.strictEqual(stmt.params[0], "PortfolioLoanDetails");
    assert.strictEqual(stmt.params[1], "PORT-001:LOAN-001");

    // Payload should contain all loan detail fields
    const storedPayload = JSON.parse(stmt.params[2] as string);
    assert.strictEqual(storedPayload.portfolioId, "PORT-001");
    assert.strictEqual(storedPayload.loanId, "LOAN-001");
    assert.strictEqual(storedPayload.borrowerName, "Acme Corp");
    assert.strictEqual(storedPayload.creditRating, "BBB");
    assert.strictEqual(storedPayload.loanAmount, 1000000);
    assert.strictEqual(storedPayload.capitalRequirement, 46000);
    assert.strictEqual(storedPayload.expectedLoss, 900);
    assert.strictEqual(storedPayload.probabilityOfDefault, 0.002);
    assert.strictEqual(storedPayload.riskBand, "Speculative - High");
    assert.strictEqual(storedPayload.simulatedDefaultRate, 0.0018);
    assert.ok(storedPayload.riskNarrative.includes("BBB"), "narrative should include credit rating");
  });

  it("composite key distinguishes different loans in same portfolio", () => {
    const makePayload = (loanId: string) => ({
      portfolioId: "PORT-001",
      loanId,
      acquisitionDate: new Date("2025-01-01T11:00:00Z"),
      borrowerName: "Corp " + loanId,
      capitalRequirement: 1000,
      creditRating: "A",
      expectedLoss: 50,
      interestRate: 3,
      loanAmount: 100000,
      maturityDate: new Date("2030-01-01T00:00:00Z"),
      probabilityOfDefault: 0.0005,
      riskBand: "Investment Grade - Low",
      expectedPortfolioLoss: 2,
      riskNarrative: "A loan",
      simulatedDefaultRate: 0.0005,
      tailRiskLoss: 30000,
      worstCaseLoss: 70000,
    });

    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioLoanDetails" };
    const result1 = portfolioLoanDetailsSlice.handlers.LoanRiskAssessed!(makePayload("LOAN-001"), meta)!;
    const result2 = portfolioLoanDetailsSlice.handlers.LoanRiskAssessed!(makePayload("LOAN-002"), meta)!;

    assert.strictEqual(result1[0].params[1], "PORT-001:LOAN-001");
    assert.strictEqual(result2[0].params[1], "PORT-001:LOAN-002");
  });
});
