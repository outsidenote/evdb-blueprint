import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { portfolioSummarySlice } from "../index.js";

describe("Projection: PortfolioSummary", () => {
  it("has correct projection name", () => {
    assert.strictEqual(portfolioSummarySlice.projectionName, "PortfolioSummary");
  });

  it("LoanRiskAssessed handler returns SQL with correct params", () => {
    const payload = {
      portfolioId: "PORT-01",
      loanId: "LOAN-001",
      loanAmount: 10000,
      capitalRequirement: 1000,
      expectedLoss: 12,
      probabilityOfDefault: 0.05,
      riskWeight: 0.30,
      creditRating: "BBB",
      borrowerName: "Acme Corp",
      acquisitionDate: new Date("2025-01-01T11:00:00Z"),
      maturityDate: new Date("2030-01-01T11:00:00Z"),
      interestRate: 0.045,
      expectedPortfolioLoss: 120,
      riskNarrative: "Moderate risk borrower",
      simulatedDefaultRate: 0.03,
      tailRiskLoss: 500,
      worstCaseLoss: 1000,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;

    assert.ok(result.length > 0, "should have at least one SQL statement");
    assert.ok(result[0].sql.length > 0, "SQL should not be empty");

    const params = result[0].params;
    assert.ok(params.length > 0, "params should not be empty");

    // Fixed params
    assert.strictEqual(params[0], "PortfolioSummary", "param $1: projection name");
    assert.strictEqual(params[1], "PORT-01",          "param $2: portfolioId key");

    // Initial INSERT payload (param $3) — first loan in portfolio
    const ip = JSON.parse(params[2] as string);
    assert.strictEqual(ip.portfolioId,             "PORT-01");
    assert.strictEqual(ip.totalLoans,              1);
    assert.strictEqual(ip.totalExposure,           10000);
    assert.strictEqual(ip.totalCapitalRequirement, 1000);
    assert.strictEqual(ip.totalExpectedLoss,       12);
    assert.strictEqual(ip.loanId,                  "LOAN-001");
    assert.strictEqual(ip.borrowerName,            "Acme Corp");
    assert.strictEqual(ip.creditRating,            "BBB");
    assert.strictEqual(ip.worstRating,             "BBB");
    assert.strictEqual(ip.worstRiskWeight,         0.30);
    // Weighted average of a single loan equals the loan's own values
    assert.strictEqual(ip.averageRiskWeight,          0.30);
    assert.strictEqual(ip.averageProbabilityOfDefault, 0.05);
    // 0.30 <= 0.35 → A; 0.30 <= 0.55 → Investment Grade
    assert.strictEqual(ip.averageRating, "A");
    assert.strictEqual(ip.riskBand,      "Investment Grade");

    // UPDATE accumulation params
    assert.strictEqual(params[3], 10000, "param $4: loanAmount");
    assert.strictEqual(params[4], 1000,  "param $5: capitalRequirement");
    assert.strictEqual(params[5], 12,    "param $6: expectedLoss");
    assert.strictEqual(params[6], 0.30,  "param $7: riskWeight");
    assert.strictEqual(params[7], 0.05,  "param $8: probabilityOfDefault");
    assert.strictEqual(params[8], "BBB", "param $9: creditRating");
  });

  it("derives correct averageRating and riskBand from riskWeight for initial loan", () => {
    const makePayload = (riskWeight: number) => ({
      portfolioId: "PORT-01",
      loanId: "LOAN-001",
      loanAmount: 10000,
      capitalRequirement: 500,
      expectedLoss: 50,
      probabilityOfDefault: 0.03,
      riskWeight,
      creditRating: "BBB",
      borrowerName: "Test Corp",
      acquisitionDate: new Date("2025-01-01T00:00:00Z"),
      maturityDate: new Date("2030-01-01T00:00:00Z"),
      interestRate: 0.04,
      expectedPortfolioLoss: 100,
      riskNarrative: "test",
      simulatedDefaultRate: 0.02,
      tailRiskLoss: 200,
      worstCaseLoss: 500,
    });

    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };

    const cases = [
      { riskWeight: 0.20, rating: "AA",  band: "Investment Grade" },
      { riskWeight: 0.30, rating: "A",   band: "Investment Grade" },
      { riskWeight: 0.45, rating: "BBB", band: "Investment Grade" },
      { riskWeight: 0.60, rating: "BB",  band: "Speculative" },
      { riskWeight: 0.80, rating: "B",   band: "Speculative" },
    ];

    for (const tc of cases) {
      const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(makePayload(tc.riskWeight), meta)!;
      const ip = JSON.parse(result[0].params[2] as string);
      assert.strictEqual(ip.averageRating, tc.rating, `riskWeight ${tc.riskWeight} → ${tc.rating}`);
      assert.strictEqual(ip.riskBand,      tc.band,   `riskWeight ${tc.riskWeight} → ${tc.band}`);
    }
  });

  it("worstRating is set to creditRating of the first loan", () => {
    const payload = {
      portfolioId: "PORT-02",
      loanId: "LOAN-A",
      loanAmount: 5000,
      capitalRequirement: 250,
      expectedLoss: 10,
      probabilityOfDefault: 0.04,
      riskWeight: 0.65,
      creditRating: "BB",
      borrowerName: "Beta Ltd",
      acquisitionDate: new Date("2025-06-01T00:00:00Z"),
      maturityDate: new Date("2028-06-01T00:00:00Z"),
      interestRate: 0.06,
      expectedPortfolioLoss: 50,
      riskNarrative: "higher risk",
      simulatedDefaultRate: 0.05,
      tailRiskLoss: 300,
      worstCaseLoss: 600,
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "PortfolioSummary" };
    const result = portfolioSummarySlice.handlers.LoanRiskAssessed!(payload, meta)!;
    const ip = JSON.parse(result[0].params[2] as string);

    assert.strictEqual(ip.worstRating,    "BB");
    assert.strictEqual(ip.worstRiskWeight, 0.65);
    // 0.65 <= 0.75 → BB; 0.65 > 0.55 → Speculative
    assert.strictEqual(ip.averageRating, "BB");
    assert.strictEqual(ip.riskBand,      "Speculative");
  });
});
