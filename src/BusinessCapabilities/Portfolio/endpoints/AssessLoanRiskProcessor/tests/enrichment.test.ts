import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRiskProcessor Enrichment", () => {
  it("enriches BBB-rated loan with correct deterministic fields", async () => {
    const maturityDate = new Date("2028-06-01"); // ~2 years, no maturity adjustment
    const input = {
      portfolioId: "port-001",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 4.5,
      loanAmount: 1000000,
      loanId: "loan-001",
      maturityDate,
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

    // acquisitionDate is today
    assert.ok(result.acquisitionDate instanceof Date);
    assert.ok(result.acquisitionDate.getTime() <= Date.now());

    // Deterministic calculations: BBB, no maturity adjustment
    // PD = 0.002, riskWeight = 0.50
    assert.strictEqual(result.probabilityOfDefault, 0.002);
    assert.strictEqual(result.capitalRequirement, 40000);   // 1000000 * 0.50 * 0.08
    assert.strictEqual(result.expectedLoss, 900);           // 1000000 * 0.002 * 0.45
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Narrative includes key fields
    assert.ok(result.riskNarrative.startsWith("BBB loan ($1000000)"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
    assert.ok(result.riskNarrative.includes("Simulated default rate:"));
    assert.ok(result.riskNarrative.includes("Expected loss: $"));
    assert.ok(result.riskNarrative.includes("VaR(95%):"));
    assert.ok(result.riskNarrative.includes("Tail risk: $"));

    // Monte Carlo results are valid numbers
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.ok(result.worstCaseLoss >= 0);
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss);
  });

  it("applies maturity adjustment for loans with maturity > 5 years", async () => {
    const maturityDate = new Date("2032-01-01"); // ~6 years, triggers 1.15x adjustment
    const input = {
      portfolioId: "port-002",
      borrowerName: "Beta Industries",
      creditRating: "A",
      interestRate: 3.5,
      loanAmount: 500000,
      loanId: "loan-002",
      maturityDate,
    };

    const result = await enrich(input);

    // A: baseRiskWeight = 0.35, adjustedRiskWeight = 0.35 * 1.15 = 0.4025
    // capitalRequirement = 500000 * 0.4025 * 0.08 = 16100
    assert.strictEqual(result.probabilityOfDefault, 0.0005);
    assert.strictEqual(result.capitalRequirement, 16100);
    assert.strictEqual(result.expectedLoss, 112.5);  // 500000 * 0.0005 * 0.45
    assert.strictEqual(result.riskBand, "Investment Grade - Medium"); // 0.4025 ≤ 0.55
  });

  it("classifies CCC-rated long-maturity loan as Speculative - Critical", async () => {
    const maturityDate = new Date("2033-01-01"); // ~7 years
    const input = {
      portfolioId: "port-003",
      borrowerName: "Gamma LLC",
      creditRating: "CCC",
      interestRate: 12.0,
      loanAmount: 200000,
      loanId: "loan-003",
      maturityDate,
    };

    const result = await enrich(input);

    // CCC: baseRiskWeight = 1.50, adjustedRiskWeight = 1.50 * 1.15 = 1.725
    // capitalRequirement = 200000 * 1.725 * 0.08 = 27600
    // expectedLoss = 200000 * 0.10 * 0.45 = 9000
    assert.strictEqual(result.probabilityOfDefault, 0.10);
    assert.strictEqual(result.capitalRequirement, 27600);
    assert.strictEqual(result.expectedLoss, 9000);
    assert.strictEqual(result.riskBand, "Speculative - Critical");

    // With PD=10%, expect significant simulated defaults
    assert.ok(result.simulatedDefaultRate > 0);
    assert.ok(result.expectedPortfolioLoss > 0);
    assert.ok(result.worstCaseLoss > 0);
  });

  it("classifies BB-rated loan as Speculative - High", async () => {
    const maturityDate = new Date("2028-01-01"); // < 5 years
    const input = {
      portfolioId: "port-004",
      borrowerName: "Delta Co",
      creditRating: "BB",
      interestRate: 7.0,
      loanAmount: 300000,
      loanId: "loan-004",
      maturityDate,
    };

    const result = await enrich(input);

    // BB: riskWeight = 0.75 (no adjustment), 0.75 ≤ 1.00 → Speculative - High
    assert.strictEqual(result.probabilityOfDefault, 0.01);
    assert.strictEqual(result.capitalRequirement, 18000); // 300000 * 0.75 * 0.08
    assert.strictEqual(result.expectedLoss, 1350);        // 300000 * 0.01 * 0.45
    assert.strictEqual(result.riskBand, "Speculative - High");
  });

  it("classifies AAA-rated loan as Investment Grade - Low", async () => {
    const maturityDate = new Date("2027-01-01"); // < 5 years
    const input = {
      portfolioId: "port-005",
      borrowerName: "Epsilon Bank",
      creditRating: "AAA",
      interestRate: 2.0,
      loanAmount: 2000000,
      loanId: "loan-005",
      maturityDate,
    };

    const result = await enrich(input);

    // AAA: riskWeight = 0.20 ≤ 0.30 → Investment Grade - Low
    assert.strictEqual(result.probabilityOfDefault, 0.0001);
    assert.strictEqual(result.capitalRequirement, 32000); // 2000000 * 0.20 * 0.08
    assert.strictEqual(result.expectedLoss, 90);          // 2000000 * 0.0001 * 0.45
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
    assert.ok(result.riskNarrative.startsWith("AAA loan ($2000000)"));
  });
});
