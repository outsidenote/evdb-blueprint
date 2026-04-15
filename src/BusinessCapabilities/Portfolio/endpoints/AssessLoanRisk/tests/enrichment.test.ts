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

  it("computes deterministic fields correctly for AAA rating with short maturity", async () => {
    // AAA, loanAmount=1,000,000, maturity 2 years from now (≤ 5 years → no maturity adjustment)
    const shortMaturityDate = new Date();
    shortMaturityDate.setFullYear(shortMaturityDate.getFullYear() + 2);

    const input = {
      portfolioId: "p1",
      borrowerName: "Acme Corp",
      creditRating: "AAA",
      interestRate: 0.04,
      loanAmount: 1_000_000,
      loanId: "loan-1",
      maturityDate: shortMaturityDate,
    };

    const result = await enrich(input);

    // Step 1: AAA → PD = 0.01% = 0.0001
    assert.strictEqual(result.probabilityOfDefault, 0.0001);

    // Step 2: AAA baseRiskWeight = 0.20; maturity 2y ≤ 5y → no adjustment → adjustedRiskWeight = 0.20
    // Step 3: capitalRequirement = 1,000,000 × 0.20 × 0.08 = 16,000
    assert.strictEqual(result.capitalRequirement, 16_000);

    // Step 4: expectedLoss = 1,000,000 × 0.0001 × 0.45 = 45
    assert.strictEqual(result.expectedLoss, 45);

    // Step 5: adjustedRiskWeight 0.20 ≤ 0.30 → "Investment Grade - Low"
    assert.strictEqual(result.riskBand, "Investment Grade - Low");

    // Step 7: Simulation outputs are non-deterministic — verify types and plausible ranges
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.ok(result.worstCaseLoss >= 0);
    assert.ok(result.tailRiskLoss >= 0);
    // CVaR (tailRiskLoss) must be ≥ VaR (worstCaseLoss) — average of the tail ≥ boundary value
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss);

    // Step 8: narrative contains credit rating, loanAmount, and riskBand
    assert.ok(result.riskNarrative.includes("AAA"));
    assert.ok(result.riskNarrative.includes("1000000"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Low"));

    // acquisitionDate is today
    assert.ok(result.acquisitionDate instanceof Date);
  });

  it("applies maturity adjustment and picks correct riskBand for CCC rating with long maturity", async () => {
    // CCC, loanAmount=500,000, maturity 6 years from now (> 5 years → ×1.15 adjustment)
    const longMaturityDate = new Date();
    longMaturityDate.setFullYear(longMaturityDate.getFullYear() + 6);

    const input = {
      portfolioId: "p2",
      borrowerName: "Risky LLC",
      creditRating: "CCC",
      interestRate: 0.15,
      loanAmount: 500_000,
      loanId: "loan-2",
      maturityDate: longMaturityDate,
    };

    const result = await enrich(input);

    // Step 1: CCC → PD = 10.00% = 0.10
    assert.strictEqual(result.probabilityOfDefault, 0.10);

    // Step 2: CCC baseRiskWeight = 1.50; maturity 6y > 5y → adjustedRiskWeight = 1.50 × 1.15 = 1.725
    // Step 3: capitalRequirement = 500,000 × 1.725 × 0.08 = 69,000
    // (approximate: 1.50 × 1.15 has IEEE-754 rounding, result ≈ 69,000)
    assert.ok(Math.abs(result.capitalRequirement - 69_000) < 0.01);

    // Step 4: expectedLoss = 500,000 × 0.10 × 0.45 = 22,500
    assert.strictEqual(result.expectedLoss, 22_500);

    // Step 5: adjustedRiskWeight 1.725 > 1.00 → "Speculative - Critical"
    assert.strictEqual(result.riskBand, "Speculative - Critical");

    // Step 7: With CCC (high PD=10%), expect meaningful defaults in simulation
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.ok(result.worstCaseLoss >= 0);
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss);

    // Step 8: narrative contains key identifiers
    assert.ok(result.riskNarrative.includes("CCC"));
    assert.ok(result.riskNarrative.includes("500000"));
    assert.ok(result.riskNarrative.includes("Speculative - Critical"));
  });

  it("uses 'Investment Grade - Medium' riskBand for BBB rating with short maturity", async () => {
    // BBB, loanAmount=200,000, maturity 2 years (≤ 5 years → no adjustment)
    const shortMaturityDate = new Date();
    shortMaturityDate.setFullYear(shortMaturityDate.getFullYear() + 2);

    const input = {
      portfolioId: "p3",
      borrowerName: "Mid Corp",
      creditRating: "BBB",
      interestRate: 0.06,
      loanAmount: 200_000,
      loanId: "loan-3",
      maturityDate: shortMaturityDate,
    };

    const result = await enrich(input);

    // Step 1: BBB → PD = 0.20% = 0.002
    assert.strictEqual(result.probabilityOfDefault, 0.002);

    // Step 2: BBB baseRiskWeight = 0.50; maturity 2y ≤ 5y → adjustedRiskWeight = 0.50
    // Step 3: capitalRequirement = 200,000 × 0.50 × 0.08 = 8,000
    assert.strictEqual(result.capitalRequirement, 8_000);

    // Step 4: expectedLoss = 200,000 × 0.002 × 0.45 = 180
    assert.strictEqual(result.expectedLoss, 180);

    // Step 5: adjustedRiskWeight 0.50 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");
  });

  it("uses 'Speculative - High' riskBand for B rating with short maturity", async () => {
    // B, loanAmount=100,000, maturity 3 years (≤ 5 years → no adjustment)
    const shortMaturityDate = new Date();
    shortMaturityDate.setFullYear(shortMaturityDate.getFullYear() + 3);

    const input = {
      portfolioId: "p4",
      borrowerName: "Spec Corp",
      creditRating: "B",
      interestRate: 0.10,
      loanAmount: 100_000,
      loanId: "loan-4",
      maturityDate: shortMaturityDate,
    };

    const result = await enrich(input);

    // Step 1: B → PD = 3.00% = 0.03
    assert.strictEqual(result.probabilityOfDefault, 0.03);

    // Step 2: B baseRiskWeight = 1.00; maturity 3y ≤ 5y → adjustedRiskWeight = 1.00
    // Step 3: capitalRequirement = 100,000 × 1.00 × 0.08 = 8,000
    assert.strictEqual(result.capitalRequirement, 8_000);

    // Step 4: expectedLoss = 100,000 × 0.03 × 0.45 = 1,350
    assert.strictEqual(result.expectedLoss, 1_350);

    // Step 5: adjustedRiskWeight 1.00 ≤ 1.00 → "Speculative - High"
    assert.strictEqual(result.riskBand, "Speculative - High");
  });
});
