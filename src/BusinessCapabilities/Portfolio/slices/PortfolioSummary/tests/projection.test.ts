import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioSummarySlice } from "../index.js";

function makePayload(overrides: Partial<{
  loanAmount: number;
  capitalRequirement: number;
  creditRating: string;
  probabilityOfDefault: number;
  expectedLoss: number;
}> = {}) {
  return {
    portfolioId: "PORT-01",
    loanId: "LOAN-001",
    borrowerName: "Acme Corp",
    loanAmount: 100000,
    capitalRequirement: 8000,
    creditRating: "A",
    expectedLoss: 500,
    expectedPortfolioLoss: 600,
    interestRate: 0.05,
    probabilityOfDefault: 0.02,
    riskNarrative: "Low risk borrower",
    simulatedDefaultRate: 0.01,
    tailRiskLoss: 2000,
    worstCaseLoss: 5000,
    acquisitionDate: new Date("2025-01-01T00:00:00Z"),
    maturityDate: new Date("2030-01-01T00:00:00Z"),
    // aggregate fields — populated by handler, not meaningful as input
    averageProbabilityOfDefault: 0,
    averageRating: "",
    averageRiskWeight: 0,
    riskBand: "",
    totalCapitalRequirement: 0,
    totalExpectedLoss: 0,
    totalExposure: 0,
    totalLoans: 0,
    worstRating: "",
    ...overrides,
  };
}

const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };

describe("Projection: PortfolioSummary", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioSummarySlice.projectionName, "PortfolioSummary");
  });

  it("LoanRiskAssessed handler returns SQL with correct params", () => {
    // riskWeight = 8000 / 100000 = 0.08  →  AA, Investment Grade
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(makePayload(), meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    assert.ok(result[0].sql.length > 0, "SQL should not be empty");
    assert.ok(result[0].params.length > 0, "params should not be empty");

    assert.strictEqual(result[0].params[0], "PortfolioSummary");  // $1 projectionName
    assert.strictEqual(result[0].params[1], "PORT-01");           // $2 key
    assert.strictEqual(typeof result[0].params[2], "string");     // $3 initial payload JSON

    const initial = JSON.parse(result[0].params[2] as string);
    assert.strictEqual(initial.portfolioId, "PORT-01");
    assert.strictEqual(initial.totalLoans, 1);
    assert.strictEqual(initial.totalExposure, 100000);
    assert.strictEqual(initial.totalCapitalRequirement, 8000);
    assert.strictEqual(initial.totalExpectedLoss, 500);
    assert.ok(Math.abs(initial.averageRiskWeight - 0.08) < 1e-10, "averageRiskWeight should be 0.08");
    assert.strictEqual(initial.averageRating, "AA");              // 0.08 ≤ 0.25
    assert.strictEqual(initial.riskBand, "Investment Grade");     // 0.08 ≤ 0.55
    assert.strictEqual(initial.worstRating, "A");                 // creditRating of first loan
    assert.ok(Math.abs(initial.worstRiskWeight - 0.08) < 1e-10, "worstRiskWeight should be 0.08");
    assert.strictEqual(initial.loanId, "LOAN-001");
    assert.strictEqual(initial.borrowerName, "Acme Corp");
    assert.strictEqual(initial.averageProbabilityOfDefault, 0.02);

    assert.strictEqual(result[0].params[3], 100000);              // $4 loanAmount
    assert.strictEqual(result[0].params[4], 8000);                // $5 capitalRequirement
    assert.strictEqual(result[0].params[5], 500);                 // $6 expectedLoss
    assert.ok(Math.abs((result[0].params[6] as number) - 0.08) < 1e-10, "$7 riskWeight should be 0.08");
    assert.strictEqual(result[0].params[7], 0.02);                // $8 probabilityOfDefault
    assert.strictEqual(result[0].params[8], "A");                 // $9 creditRating
    assert.strictEqual(typeof result[0].params[9], "string");     // $10 loan fields JSON
  });

  it("derives AA rating when riskWeight ≤ 0.25", () => {
    // riskWeight = 2000 / 10000 = 0.20
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(
      makePayload({ loanAmount: 10000, capitalRequirement: 2000 }), meta,
    )!;
    const initial = JSON.parse(result[0].params[2] as string);
    assert.strictEqual(initial.averageRating, "AA");
    assert.strictEqual(initial.riskBand, "Investment Grade");
  });

  it("derives A rating when 0.25 < riskWeight ≤ 0.35", () => {
    // riskWeight = 3000 / 10000 = 0.30
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(
      makePayload({ loanAmount: 10000, capitalRequirement: 3000 }), meta,
    )!;
    const initial = JSON.parse(result[0].params[2] as string);
    assert.strictEqual(initial.averageRating, "A");
  });

  it("derives BBB rating when 0.35 < riskWeight ≤ 0.50", () => {
    // riskWeight = 4000 / 10000 = 0.40
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(
      makePayload({ loanAmount: 10000, capitalRequirement: 4000 }), meta,
    )!;
    const initial = JSON.parse(result[0].params[2] as string);
    assert.strictEqual(initial.averageRating, "BBB");
  });

  it("derives BB rating when 0.50 < riskWeight ≤ 0.75", () => {
    // riskWeight = 6000 / 10000 = 0.60
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(
      makePayload({ loanAmount: 10000, capitalRequirement: 6000 }), meta,
    )!;
    const initial = JSON.parse(result[0].params[2] as string);
    assert.strictEqual(initial.averageRating, "BB");
    assert.strictEqual(initial.riskBand, "Speculative");          // 0.60 > 0.55
  });

  it("derives B rating and Speculative band when riskWeight > 0.75", () => {
    // riskWeight = 8000 / 10000 = 0.80
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(
      makePayload({ loanAmount: 10000, capitalRequirement: 8000 }), meta,
    )!;
    const initial = JSON.parse(result[0].params[2] as string);
    assert.strictEqual(initial.averageRating, "B");
    assert.strictEqual(initial.riskBand, "Speculative");
  });

  it("handles zero loanAmount without throwing (riskWeight defaults to 0)", () => {
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(
      makePayload({ loanAmount: 0, capitalRequirement: 0 }), meta,
    )!;
    const initial = JSON.parse(result[0].params[2] as string);
    assert.strictEqual(initial.averageRiskWeight, 0);
    assert.strictEqual(initial.averageRating, "AA");              // 0 ≤ 0.25
  });

  it("SQL contains ON CONFLICT accumulation for totalLoans", () => {
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(makePayload(), meta)!;
    assert.ok(result[0].sql.includes("ON CONFLICT"), "SQL must contain ON CONFLICT clause");
    assert.ok(result[0].sql.includes("totalLoans"), "SQL must accumulate totalLoans");
    assert.ok(result[0].sql.includes("totalExposure"), "SQL must accumulate totalExposure");
    assert.ok(result[0].sql.includes("worstRating"), "SQL must track worstRating");
    assert.ok(result[0].sql.includes("Investment Grade"), "SQL must derive riskBand");
  });
});
