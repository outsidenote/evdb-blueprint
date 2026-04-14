import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

function futureDate(yearsFromNow: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + yearsFromNow);
  return d;
}

describe("AssessLoanRiskProcessor Enrichment", () => {
  it("enriches a BBB-rated loan with maturity <= 5 years", async () => {
    const maturityDate = futureDate(3);
    const input = {
      portfolioId: "portfolio-1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 5.5,
      loanAmount: 1000000,
      loanId: "loan-1",
      maturityDate,
    };

    const result = await enrich(input);

    // Input passthrough
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // Deterministic fields
    assert.ok(result.acquisitionDate instanceof Date);
    // BBB: PD = 0.002
    assert.strictEqual(result.probabilityOfDefault, 0.002);
    // BBB: riskWeight = 0.50, no maturity adjustment → capitalRequirement = 1000000 * 0.50 * 0.08 = 40000
    assert.strictEqual(result.capitalRequirement, 40000);
    // expectedLoss = 1000000 * 0.002 * 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);
    // adjustedRiskWeight 0.50 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Simulation fields (stochastic — verify types and range only)
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.ok(result.worstCaseLoss >= 0);
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss || result.tailRiskLoss === 0);

    // Narrative
    assert.ok(result.riskNarrative.includes("BBB"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
    assert.ok(result.riskNarrative.includes("$1000000"));
  });

  it("applies maturity adjustment for loans > 5 years (A-rated)", async () => {
    const maturityDate = futureDate(7);
    const input = {
      portfolioId: "portfolio-2",
      borrowerName: "Beta Inc",
      creditRating: "A",
      interestRate: 4.0,
      loanAmount: 500000,
      loanId: "loan-2",
      maturityDate,
    };

    const result = await enrich(input);

    // A: PD = 0.0005
    assert.strictEqual(result.probabilityOfDefault, 0.0005);
    // A: riskWeight = 0.35 * 1.15 = 0.4025 → capitalRequirement = 500000 * 0.4025 * 0.08 = 16100
    assert.strictEqual(result.capitalRequirement, 16100);
    // expectedLoss = 500000 * 0.0005 * 0.45 = 112.5
    assert.strictEqual(result.expectedLoss, 112.5);
    // adjustedRiskWeight 0.4025 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");
  });

  it("assigns Investment Grade - Low for AAA-rated loan", async () => {
    const input = {
      portfolioId: "portfolio-3",
      borrowerName: "Gamma Sovereign",
      creditRating: "AAA",
      interestRate: 2.0,
      loanAmount: 2000000,
      loanId: "loan-3",
      maturityDate: futureDate(2),
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.0001);
    // AAA: riskWeight = 0.20, no adjustment → capitalRequirement = 2000000 * 0.20 * 0.08 = 32000
    assert.strictEqual(result.capitalRequirement, 32000);
    // adjustedRiskWeight 0.20 ≤ 0.30 → "Investment Grade - Low"
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
  });

  it("assigns Speculative - High for B-rated loan", async () => {
    const input = {
      portfolioId: "portfolio-4",
      borrowerName: "Delta Ventures",
      creditRating: "B",
      interestRate: 9.0,
      loanAmount: 300000,
      loanId: "loan-4",
      maturityDate: futureDate(2),
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.03);
    // B: riskWeight = 1.00 → capitalRequirement = 300000 * 1.00 * 0.08 = 24000
    assert.strictEqual(result.capitalRequirement, 24000);
    // expectedLoss = 300000 * 0.03 * 0.45 = 4050
    assert.strictEqual(result.expectedLoss, 4050);
    // adjustedRiskWeight 1.00 ≤ 1.00 → "Speculative - High"
    assert.strictEqual(result.riskBand, "Speculative - High");
  });

  it("assigns Speculative - Critical for CCC-rated loan", async () => {
    const input = {
      portfolioId: "portfolio-5",
      borrowerName: "Epsilon Holdings",
      creditRating: "CCC",
      interestRate: 14.0,
      loanAmount: 200000,
      loanId: "loan-5",
      maturityDate: futureDate(2),
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.10);
    // CCC: riskWeight = 1.50 → capitalRequirement = 200000 * 1.50 * 0.08 = 24000
    assert.strictEqual(result.capitalRequirement, 24000);
    // expectedLoss = 200000 * 0.10 * 0.45 = 9000
    assert.strictEqual(result.expectedLoss, 9000);
    // adjustedRiskWeight 1.50 > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");
    assert.ok(result.riskNarrative.includes("CCC"));
    assert.ok(result.riskNarrative.includes("Speculative - Critical"));
  });
});
