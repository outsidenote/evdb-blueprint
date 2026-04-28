import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRisk Enrichment", () => {
  it("enriches input with computed fields", async () => {
    const input = {
    portfolioId: "test",
    borrowerName: "test",
    creditRating: "test",
    interestRate: 0,
    loanAmount: 0,
    loanId: "test",
    maturityDate: "test",
    };

    const result = await enrich(input);

    // Verify input fields are passed through
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // Verify enriched fields are populated
    assert.ok(result.acquisitionDate instanceof Date);
    assert.strictEqual(typeof result.capitalRequirement, "number");
    assert.strictEqual(typeof result.expectedLoss, "number");
    assert.strictEqual(typeof result.probabilityOfDefault, "number");
    assert.strictEqual(typeof result.riskBand, "string");
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.strictEqual(typeof result.riskNarrative, "string");
  });

  it("computes correct deterministic values for BBB rating with 3yr maturity (no maturity adj)", async () => {
    const input = {
      portfolioId: "p1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 5.5,
      loanAmount: 1_000_000,
      loanId: "loan-bbb-1",
      // ~3 years from now — stays under 5yr threshold, no maturity adjustment
      maturityDate: new Date(Date.now() + 3 * 365.25 * 24 * 60 * 60 * 1000),
    };
    const result = await enrich(input);

    // Step 1: BBB → PD = 0.20% = 0.002
    assert.strictEqual(result.probabilityOfDefault, 0.002);

    // Step 2: BBB → base risk weight = 0.50; maturity ~3yr < 5yr → no adjustment
    // Step 3: capitalRequirement = 1,000,000 × 0.50 × 0.08 = 40,000
    assert.strictEqual(result.capitalRequirement, 40_000);

    // Step 4: expectedLoss = 1,000,000 × 0.002 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);

    // Step 5: adjustedRiskWeight = 0.50; 0.30 < 0.50 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Step 6-7: Monte Carlo outputs are non-deterministic — verify range and type only
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1,
      `simulatedDefaultRate must be in [0, 1], got ${result.simulatedDefaultRate}`);
    assert.ok(result.expectedPortfolioLoss >= 0,
      `expectedPortfolioLoss must be non-negative, got ${result.expectedPortfolioLoss}`);
    assert.ok(result.worstCaseLoss >= 0,
      `worstCaseLoss must be non-negative, got ${result.worstCaseLoss}`);
    assert.ok(result.tailRiskLoss >= 0,
      `tailRiskLoss must be non-negative, got ${result.tailRiskLoss}`);

    // Step 8: riskNarrative must be a non-empty string containing key identifiers
    assert.ok(result.riskNarrative.length > 0);
    assert.ok(result.riskNarrative.includes("BBB"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
  });

  it("applies 1.15 maturity multiplier for AAA loans with maturity > 5 years", async () => {
    const input = {
      portfolioId: "p2",
      borrowerName: "Long Corp",
      creditRating: "AAA",
      interestRate: 2.0,
      loanAmount: 1_000_000,
      loanId: "loan-aaa-1",
      // ~10 years from now — exceeds 5yr threshold, applies 1.15× multiplier
      maturityDate: new Date(Date.now() + 10 * 365.25 * 24 * 60 * 60 * 1000),
    };
    const result = await enrich(input);

    // Step 1: AAA → PD = 0.01% = 0.0001
    assert.strictEqual(result.probabilityOfDefault, 0.0001);

    // Step 2: AAA → base risk weight = 0.20; maturity ~10yr > 5yr → 0.20 × 1.15 = 0.23
    // Step 3: capitalRequirement = 1,000,000 × 0.23 × 0.08 = 18,400
    // (tolerance for float arithmetic: 0.20 × 1.15 may not be exactly 0.23 in IEEE 754)
    assert.ok(
      Math.abs(result.capitalRequirement - 18_400) < 0.01,
      `capitalRequirement expected ~18400, got ${result.capitalRequirement}`
    );

    // Step 4: expectedLoss = 1,000,000 × 0.0001 × 0.45 = 45
    assert.strictEqual(result.expectedLoss, 45);

    // Step 5: adjustedRiskWeight = 0.23; 0.23 ≤ 0.30 → "Investment Grade - Low"
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
  });

  it("classifies CCC rating as Speculative Critical with correct capital and expected loss", async () => {
    const input = {
      portfolioId: "p3",
      borrowerName: "Junk Corp",
      creditRating: "CCC",
      interestRate: 15.0,
      loanAmount: 500_000,
      loanId: "loan-ccc-1",
      // ~2 years from now — stays under 5yr threshold, no maturity adjustment
      maturityDate: new Date(Date.now() + 2 * 365.25 * 24 * 60 * 60 * 1000),
    };
    const result = await enrich(input);

    // Step 1: CCC → PD = 10.00% = 0.10
    assert.strictEqual(result.probabilityOfDefault, 0.10);

    // Step 2: CCC → base risk weight = 1.50; maturity ~2yr < 5yr → no adjustment
    // Step 3: capitalRequirement = 500,000 × 1.50 × 0.08 = 60,000
    assert.ok(
      Math.abs(result.capitalRequirement - 60_000) < 0.01,
      `capitalRequirement expected ~60000, got ${result.capitalRequirement}`
    );

    // Step 4: expectedLoss = 500,000 × 0.10 × 0.45 = 22,500
    assert.strictEqual(result.expectedLoss, 22_500);

    // Step 5: adjustedRiskWeight = 1.50 > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");
  });

  it("classifies B rating with >5yr maturity as Speculative Critical after adjustment", async () => {
    const input = {
      portfolioId: "p4",
      borrowerName: "Risky Corp",
      creditRating: "B",
      interestRate: 10.0,
      loanAmount: 200_000,
      loanId: "loan-b-1",
      // ~6 years from now — exceeds 5yr threshold, applies 1.15× multiplier
      maturityDate: new Date(Date.now() + 6 * 365.25 * 24 * 60 * 60 * 1000),
    };
    const result = await enrich(input);

    // Step 1: B → PD = 3.00% = 0.030
    assert.strictEqual(result.probabilityOfDefault, 0.030);

    // Step 2: B → base risk weight = 1.00; maturity ~6yr > 5yr → 1.00 × 1.15 = 1.15
    // Step 3: capitalRequirement = 200,000 × 1.15 × 0.08 = 18,400
    assert.ok(
      Math.abs(result.capitalRequirement - 18_400) < 0.01,
      `capitalRequirement expected ~18400, got ${result.capitalRequirement}`
    );

    // Step 5: adjustedRiskWeight = 1.15 > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");
  });

  it("sets acquisitionDate to a current Date on every call", async () => {
    const before = new Date();
    const input = {
      portfolioId: "p5",
      borrowerName: "Time Corp",
      creditRating: "A",
      interestRate: 3.0,
      loanAmount: 100_000,
      loanId: "loan-a-1",
      maturityDate: new Date(Date.now() + 1 * 365.25 * 24 * 60 * 60 * 1000),
    };
    const result = await enrich(input);
    const after = new Date();

    assert.ok(result.acquisitionDate instanceof Date);
    assert.ok(result.acquisitionDate >= before, "acquisitionDate must not be in the past");
    assert.ok(result.acquisitionDate <= after, "acquisitionDate must not be in the future");
  });
});
