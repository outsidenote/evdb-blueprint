import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRisk Enrichment", () => {
  it("computes deterministic fields for BBB loan with maturity under 5 years", async () => {
    // ~3 years from now — no maturity adjustment
    const shortMaturityDate = new Date(Date.now() + 3 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "portfolio-001",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.05,
      loanAmount: 1_000_000,
      loanId: "loan-001",
      maturityDate: shortMaturityDate,
    };

    const before = new Date();
    const result = await enrich(input);
    const after = new Date();

    // Input fields must pass through unchanged
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // acquisitionDate must be the timestamp of the enrichment call
    assert.ok(result.acquisitionDate instanceof Date);
    assert.ok(result.acquisitionDate >= before && result.acquisitionDate <= after);

    // probabilityOfDefault: BBB → 0.0020
    assert.strictEqual(result.probabilityOfDefault, 0.0020);

    // capitalRequirement = loanAmount × adjustedRiskWeight × 0.08
    // BBB base risk weight = 0.50; maturity < 5 years → no adjustment → adjustedRiskWeight = 0.50
    // capitalRequirement = 1_000_000 × 0.50 × 0.08 = 40_000
    assert.strictEqual(result.capitalRequirement, 40_000);

    // expectedLoss = loanAmount × PD × LGD (45%)
    // expectedLoss = 1_000_000 × 0.0020 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);

    // riskBand: adjustedRiskWeight 0.50 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Monte Carlo fields — non-deterministic; verify type and plausible range
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);

    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.ok(result.expectedPortfolioLoss >= 0);

    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.ok(result.worstCaseLoss >= 0);

    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.tailRiskLoss >= 0);

    // riskNarrative must embed the credit rating and risk band
    assert.strictEqual(typeof result.riskNarrative, "string");
    assert.ok(result.riskNarrative.includes("BBB"), `Expected narrative to contain 'BBB': ${result.riskNarrative}`);
    assert.ok(
      result.riskNarrative.includes("Investment Grade - Medium"),
      `Expected narrative to contain risk band: ${result.riskNarrative}`,
    );
  });

  it("applies 1.15 maturity multiplier for AAA loan over 5 years", async () => {
    // ~6 years from now — maturity adjustment applies
    const longMaturityDate = new Date(Date.now() + 6 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "portfolio-002",
      borrowerName: "Beta Inc",
      creditRating: "AAA",
      interestRate: 0.03,
      loanAmount: 500_000,
      loanId: "loan-002",
      maturityDate: longMaturityDate,
    };

    const result = await enrich(input);

    // probabilityOfDefault: AAA → 0.0001
    assert.strictEqual(result.probabilityOfDefault, 0.0001);

    // capitalRequirement = loanAmount × adjustedRiskWeight × 0.08
    // AAA base risk weight = 0.20; maturity > 5 years → adjustedRiskWeight = 0.20 × 1.15 = 0.23
    // capitalRequirement = 500_000 × 0.23 × 0.08 = 9_200
    assert.ok(
      Math.abs(result.capitalRequirement - 9_200) < 0.01,
      `Expected capitalRequirement ≈ 9200, got ${result.capitalRequirement}`,
    );

    // expectedLoss = 500_000 × 0.0001 × 0.45 = 22.5
    assert.strictEqual(result.expectedLoss, 22.5);

    // riskBand: adjustedRiskWeight ≈ 0.23 ≤ 0.30 → "Investment Grade - Low"
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
  });

  it("returns Speculative - Critical for CCC loan over 5 years", async () => {
    // ~6 years from now — maturity adjustment applies
    const longMaturityDate = new Date(Date.now() + 6 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "portfolio-003",
      borrowerName: "Gamma LLC",
      creditRating: "CCC",
      interestRate: 0.12,
      loanAmount: 200_000,
      loanId: "loan-003",
      maturityDate: longMaturityDate,
    };

    const result = await enrich(input);

    // probabilityOfDefault: CCC → 0.1000
    assert.strictEqual(result.probabilityOfDefault, 0.1000);

    // capitalRequirement = loanAmount × adjustedRiskWeight × 0.08
    // CCC base risk weight = 1.50; maturity > 5 years → adjustedRiskWeight = 1.50 × 1.15 = 1.725
    // capitalRequirement = 200_000 × 1.725 × 0.08 = 27_600
    assert.ok(
      Math.abs(result.capitalRequirement - 27_600) < 0.01,
      `Expected capitalRequirement ≈ 27600, got ${result.capitalRequirement}`,
    );

    // expectedLoss = 200_000 × 0.1000 × 0.45 = 9_000
    assert.strictEqual(result.expectedLoss, 9_000);

    // riskBand: adjustedRiskWeight ≈ 1.725 > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");

    // CCC has the highest PD (10%) — simulation should record meaningful defaults
    // With PD=0.10 and 1000 iterations, expected defaults ≈ 100
    // simulatedDefaultRate should be well above 0
    assert.ok(
      result.simulatedDefaultRate > 0,
      `Expected simulatedDefaultRate > 0 for CCC, got ${result.simulatedDefaultRate}`,
    );

    // Recovery rate for CCC = 0.20 → lossPerDefault = 200_000 × 0.80 = 160_000
    // With ~100 defaults, worstCaseLoss (95th percentile) should be 160_000
    assert.strictEqual(result.worstCaseLoss, 160_000);
  });

  it("returns Speculative - High for B loan under 5 years", async () => {
    const shortMaturityDate = new Date(Date.now() + 2 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "portfolio-004",
      borrowerName: "Delta Co",
      creditRating: "B",
      interestRate: 0.08,
      loanAmount: 300_000,
      loanId: "loan-004",
      maturityDate: shortMaturityDate,
    };

    const result = await enrich(input);

    // probabilityOfDefault: B → 0.0300
    assert.strictEqual(result.probabilityOfDefault, 0.0300);

    // capitalRequirement = loanAmount × adjustedRiskWeight × 0.08
    // B base risk weight = 1.00; maturity < 5 years → adjustedRiskWeight = 1.00
    // capitalRequirement = 300_000 × 1.00 × 0.08 = 24_000
    assert.strictEqual(result.capitalRequirement, 24_000);

    // expectedLoss = 300_000 × 0.0300 × 0.45 = 4_050
    assert.strictEqual(result.expectedLoss, 4_050);

    // riskBand: adjustedRiskWeight 1.00 ≤ 1.00 → "Speculative - High"
    assert.strictEqual(result.riskBand, "Speculative - High");
  });
});
