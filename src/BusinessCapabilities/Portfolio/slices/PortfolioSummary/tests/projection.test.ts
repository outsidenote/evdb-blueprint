import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioSummarySlice } from "../index.js";

describe("Projection: PortfolioSummary", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioSummarySlice.projectionName, "PortfolioSummary");
  });

  it("LoanRiskAssessed handler returns SQL statements", () => {
    // riskWeight=0.30 → rating="A" (≤0.35), riskBand="Investment Grade" (≤0.55), rank=4
    const payload = {
      portfolioId: "PORT-01",
      loanAmount: 10000,
      riskWeight: 0.30,
      probabilityOfDefault: 5,
      capitalRequirement: 1000,
      expectedLoss: 12,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    assert.ok(result[0].sql.includes("ON CONFLICT"), "SQL should be an UPSERT");
    assert.ok(result[0].sql.includes("jsonb_build_object"), "SQL should use jsonb_build_object");

    // Verify param positions match the handler's param array
    assert.strictEqual(result[0].params[0], "PortfolioSummary");  // $1 projectionName
    assert.strictEqual(result[0].params[1], "PORT-01");            // $2 key
    assert.strictEqual(result[0].params[2], 10000);                // $3 loanAmount
    assert.strictEqual(result[0].params[3], 1000);                 // $4 capitalRequirement
    assert.strictEqual(result[0].params[4], 12);                   // $5 expectedLoss
    assert.strictEqual(result[0].params[5], 0.30);                 // $6 riskWeight
    assert.strictEqual(result[0].params[6], 5);                    // $7 probabilityOfDefault
    assert.strictEqual(result[0].params[7], "A");                  // $8 incomingRating (0.30 ≤ 0.35 → A)
    assert.strictEqual(result[0].params[8], "Investment Grade");   // $9 incomingRiskBand (0.30 ≤ 0.55)
    assert.strictEqual(result[0].params[9], 4);                    // $10 incomingRank (A = rank 4)
    assert.strictEqual(result[0].params[10], "PORT-01");           // $11 portfolioId for jsonb_build_object
  });

  it("derives 'B' rating and 'Speculative' band for high riskWeight", () => {
    // riskWeight=0.80 → rating="B" (>0.75), riskBand="Speculative" (>0.55), rank=1
    const payload = {
      portfolioId: "PORT-02",
      loanAmount: 5000,
      riskWeight: 0.80,
      probabilityOfDefault: 15,
      capitalRequirement: 500,
      expectedLoss: 50,
    };
    const meta = { outboxId: "test-id-2", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.strictEqual(result[0].params[7], "B");           // $8 incomingRating (0.80 > 0.75 → B)
    assert.strictEqual(result[0].params[8], "Speculative"); // $9 incomingRiskBand (0.80 > 0.55)
    assert.strictEqual(result[0].params[9], 1);             // $10 incomingRank (B = rank 1, worst)
  });

  it("derives correct rating at each threshold boundary", () => {
    const meta = { outboxId: "t", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const base = { portfolioId: "P", loanAmount: 1000, probabilityOfDefault: 1, capitalRequirement: 100, expectedLoss: 1 };

    // Exactly at boundary: ≤0.25 → AA
    const r1 = portfolioSummarySlice.handlers.LoanRiskAssessed!({ ...base, riskWeight: 0.25 }, meta)!;
    assert.strictEqual(r1[0].params[7], "AA");

    // Just above 0.25, at 0.35 → A
    const r2 = portfolioSummarySlice.handlers.LoanRiskAssessed!({ ...base, riskWeight: 0.35 }, meta)!;
    assert.strictEqual(r2[0].params[7], "A");

    // Just above 0.35, at 0.50 → BBB
    const r3 = portfolioSummarySlice.handlers.LoanRiskAssessed!({ ...base, riskWeight: 0.50 }, meta)!;
    assert.strictEqual(r3[0].params[7], "BBB");

    // Just above 0.50, at 0.75 → BB
    const r4 = portfolioSummarySlice.handlers.LoanRiskAssessed!({ ...base, riskWeight: 0.75 }, meta)!;
    assert.strictEqual(r4[0].params[7], "BB");

    // Just above 0.75 → B
    const r5 = portfolioSummarySlice.handlers.LoanRiskAssessed!({ ...base, riskWeight: 0.76 }, meta)!;
    assert.strictEqual(r5[0].params[7], "B");
  });
});
