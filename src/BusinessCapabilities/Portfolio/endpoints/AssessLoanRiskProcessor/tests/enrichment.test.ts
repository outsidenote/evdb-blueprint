import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRiskProcessor Enrichment", () => {
  it("computes deterministic fields for BBB rating with 3-year maturity (no adjustment)", async () => {
    // maturityDate 2029-04-15 is ~3 years from now (2026-04-15) → maturityYears < 5 → no adjustment
    const input = {
      portfolioId: "port-1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 0.045,
      loanAmount: 1_000_000,
      loanId: "loan-1",
      maturityDate: new Date("2029-04-15"),
    };

    const result = await enrich(input);

    // Input fields pass through unchanged
    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);

    // acquisitionDate is set to current time
    assert.ok(result.acquisitionDate instanceof Date);

    // Step 1: PD for BBB = 0.002 (0.20%)
    assert.strictEqual(result.probabilityOfDefault, 0.002);

    // Step 2: baseRiskWeight(BBB) = 0.50; maturityYears ~3 < 5 → adjustedRiskWeight = 0.50
    // Step 3: capitalRequirement = 1,000,000 × 0.50 × 0.08 = 40,000
    assert.strictEqual(result.capitalRequirement, 40_000);

    // Step 4: expectedLoss = 1,000,000 × 0.002 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);

    // Step 5: adjustedRiskWeight 0.50 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // riskNarrative contains deterministic prefix
    assert.ok(
      result.riskNarrative.startsWith("BBB loan ($1000000): Investment Grade - Medium."),
      `Expected deterministic prefix, got: ${result.riskNarrative}`,
    );
    assert.ok(result.riskNarrative.includes("Simulated default rate:"));
    assert.ok(result.riskNarrative.includes("VaR(95%):"));
    assert.ok(result.riskNarrative.includes("Tail risk:"));
  });

  it("applies maturity adjustment for CCC rating with 7-year maturity", async () => {
    // maturityDate 2033-04-15 is ~7 years from now (2026-04-15) → maturityYears > 5 → × 1.15
    const input = {
      portfolioId: "port-2",
      borrowerName: "Risky Borrower",
      creditRating: "CCC",
      interestRate: 0.12,
      loanAmount: 500_000,
      loanId: "loan-2",
      maturityDate: new Date("2033-04-15"),
    };

    const result = await enrich(input);

    // Step 1: PD for CCC = 0.10 (10.00%)
    assert.strictEqual(result.probabilityOfDefault, 0.10);

    // Step 2: baseRiskWeight(CCC) = 1.50; maturityYears ~7 > 5 → adjustedRiskWeight = 1.50 × 1.15 = 1.725
    // Step 3: capitalRequirement = 500,000 × 1.725 × 0.08 = 69,000
    assert.strictEqual(result.capitalRequirement, 69_000);

    // Step 4: expectedLoss = 500,000 × 0.10 × 0.45 = 22,500
    assert.strictEqual(result.expectedLoss, 22_500);

    // Step 5: adjustedRiskWeight 1.725 > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");

    assert.ok(
      result.riskNarrative.startsWith("CCC loan ($500000): Speculative - Critical."),
      `Expected deterministic prefix, got: ${result.riskNarrative}`,
    );
  });

  it("assigns Investment Grade - Low for AAA rating with 2-year maturity", async () => {
    // maturityDate 2028-04-15 is ~2 years from now → no maturity adjustment
    const input = {
      portfolioId: "port-3",
      borrowerName: "Prime Borrower",
      creditRating: "AAA",
      interestRate: 0.025,
      loanAmount: 2_000_000,
      loanId: "loan-3",
      maturityDate: new Date("2028-04-15"),
    };

    const result = await enrich(input);

    // Step 1: PD for AAA = 0.0001 (0.01%)
    assert.strictEqual(result.probabilityOfDefault, 0.0001);

    // Step 2: baseRiskWeight(AAA) = 0.20; maturityYears ~2 < 5 → adjustedRiskWeight = 0.20
    // Step 3: capitalRequirement = 2,000,000 × 0.20 × 0.08 = 32,000
    assert.strictEqual(result.capitalRequirement, 32_000);

    // Step 4: expectedLoss = 2,000,000 × 0.0001 × 0.45 = 90
    assert.strictEqual(result.expectedLoss, 90);

    // Step 5: adjustedRiskWeight 0.20 ≤ 0.30 → "Investment Grade - Low"
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
  });

  it("assigns Speculative - High for BB rating with 6-year maturity", async () => {
    // maturityDate 2032-04-15 is ~6 years from now → maturityYears > 5 → × 1.15
    const input = {
      portfolioId: "port-4",
      borrowerName: "Speculative Borrower",
      creditRating: "BB",
      interestRate: 0.07,
      loanAmount: 800_000,
      loanId: "loan-4",
      maturityDate: new Date("2032-04-15"),
    };

    const result = await enrich(input);

    // Step 1: PD for BB = 0.01 (1.00%)
    assert.strictEqual(result.probabilityOfDefault, 0.01);

    // Step 2: baseRiskWeight(BB) = 0.75; maturityYears ~6 > 5 → adjustedRiskWeight = 0.75 × 1.15 = 0.8625
    // Step 3: capitalRequirement = 800,000 × 0.8625 × 0.08 = 55,200
    assert.strictEqual(result.capitalRequirement, 55_200);

    // Step 4: expectedLoss = 800,000 × 0.01 × 0.45 = 3,600
    assert.strictEqual(result.expectedLoss, 3_600);

    // Step 5: adjustedRiskWeight 0.8625 ≤ 1.00 → "Speculative - High"
    assert.strictEqual(result.riskBand, "Speculative - High");
  });

  it("Monte Carlo simulation produces valid outputs for B rating", async () => {
    // B rating: PD = 3%, recoveryRate = 0.30, lossPerDefault = 1,000,000 × (1 - 0.30) = 700,000
    // 1000 trials, expected ~30 defaults → simulatedDefaultRate ≈ 0.03
    const input = {
      portfolioId: "port-5",
      borrowerName: "High-Yield Borrower",
      creditRating: "B",
      interestRate: 0.09,
      loanAmount: 1_000_000,
      loanId: "loan-5",
      maturityDate: new Date("2028-04-15"),
    };

    const result = await enrich(input);

    // Step 1: PD for B = 0.03 (3.00%)
    assert.strictEqual(result.probabilityOfDefault, 0.03);

    // Step 2-3: baseRiskWeight(B) = 1.00; maturity ~2yr < 5 → adjustedRiskWeight = 1.00
    // capitalRequirement = 1,000,000 × 1.00 × 0.08 = 80,000
    assert.strictEqual(result.capitalRequirement, 80_000);

    // Step 4: expectedLoss = 1,000,000 × 0.03 × 0.45 = 13,500
    assert.strictEqual(result.expectedLoss, 13_500);

    // Step 5: adjustedRiskWeight 1.00 ≤ 1.00 → "Speculative - High"
    assert.strictEqual(result.riskBand, "Speculative - High");

    // Step 6-7: simulatedDefaultRate = defaults / 1000, should approximate PD = 0.03
    // Allow wide tolerance for stochastic variance: ±3× PD
    assert.ok(
      result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 0.12,
      `simulatedDefaultRate ${result.simulatedDefaultRate} out of expected range [0, 0.12] for PD=0.03`,
    );

    // expectedPortfolioLoss ≈ PD × lossPerDefault = 0.03 × 700,000 = 21,000
    // Allow wide tolerance for Monte Carlo variance
    assert.ok(
      result.expectedPortfolioLoss >= 0 && result.expectedPortfolioLoss <= 84_000,
      `expectedPortfolioLoss ${result.expectedPortfolioLoss} out of expected range`,
    );

    // Loss outcomes are binary (0 or 700,000), so worstCaseLoss must be one of these values
    assert.ok(
      result.worstCaseLoss === 0 || result.worstCaseLoss === 700_000,
      `worstCaseLoss ${result.worstCaseLoss} should be 0 or 700000 (binary loss distribution)`,
    );

    // tailRiskLoss (CVaR) is the average of worst 5% → must be ≥ worstCaseLoss (95th percentile)
    assert.ok(
      result.tailRiskLoss >= result.worstCaseLoss,
      `tailRiskLoss ${result.tailRiskLoss} should be >= worstCaseLoss ${result.worstCaseLoss}`,
    );

    // riskNarrative contains all required sections
    assert.ok(result.riskNarrative.includes("B loan ($1000000): Speculative - High."), `narrative missing loan header`);
    assert.ok(result.riskNarrative.includes("Simulated default rate:"), `narrative missing default rate`);
    assert.ok(result.riskNarrative.includes("Expected loss:"), `narrative missing expected loss`);
    assert.ok(result.riskNarrative.includes("VaR(95%):"), `narrative missing VaR`);
    assert.ok(result.riskNarrative.includes("Tail risk:"), `narrative missing tail risk`);
  });
});
