import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("AssessLoanRiskProcessor Enrichment", () => {
  it("passes all input fields through to output", async () => {
    const maturityDate = new Date("2027-01-01");
    const input = {
      portfolioId: "p1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 5.5,
      loanAmount: 1_000_000,
      loanId: "loan-1",
      maturityDate,
    };

    const result = await enrich(input);

    assert.strictEqual(result.portfolioId, input.portfolioId);
    assert.strictEqual(result.borrowerName, input.borrowerName);
    assert.strictEqual(result.creditRating, input.creditRating);
    assert.strictEqual(result.interestRate, input.interestRate);
    assert.strictEqual(result.loanAmount, input.loanAmount);
    assert.strictEqual(result.loanId, input.loanId);
    assert.strictEqual(result.maturityDate, input.maturityDate);
  });

  it("computes correct deterministic fields for BBB, short maturity", async () => {
    // maturityDate 3 years out — no maturity adjustment
    const maturityDate = new Date(Date.now() + 3 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "p1",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 5.5,
      loanAmount: 1_000_000,
      loanId: "loan-1",
      maturityDate,
    };

    const result = await enrich(input);

    // Step 1: PD
    assert.strictEqual(result.probabilityOfDefault, 0.002);
    // Step 3: capitalRequirement = 1_000_000 × 0.50 × 0.08 = 40_000
    assert.strictEqual(result.capitalRequirement, 40_000);
    // Step 4: expectedLoss = 1_000_000 × 0.002 × 0.45 = 900
    assert.strictEqual(result.expectedLoss, 900);
    // Step 5: riskBand — adjustedRiskWeight 0.50 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");
    // acquisitionDate is a real Date
    assert.ok(result.acquisitionDate instanceof Date);
    assert.ok(!isNaN(result.acquisitionDate.getTime()));
  });

  it("applies maturity adjustment for loans > 5 years", async () => {
    // maturityDate 7 years out — risk weight multiplied by 1.15
    const maturityDate = new Date(Date.now() + 7 * 365.25 * 24 * 60 * 60 * 1000);
    const input = {
      portfolioId: "p2",
      borrowerName: "Beta LLC",
      creditRating: "A",
      interestRate: 4.0,
      loanAmount: 500_000,
      loanId: "loan-2",
      maturityDate,
    };

    const result = await enrich(input);

    // adjustedRiskWeight = round2(0.35 × 1.15) = round2(0.4025) = 0.40
    // capitalRequirement = 500_000 × 0.40 × 0.08 = 16_000
    assert.strictEqual(result.capitalRequirement, 16_000);
    // expectedLoss = 500_000 × 0.0005 × 0.45 = 112.5
    assert.strictEqual(result.expectedLoss, 112.5);
    // riskBand — adjustedRiskWeight 0.40 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");
  });

  it("produces Investment Grade - Low for AAA", async () => {
    const input = {
      portfolioId: "p3",
      borrowerName: "Gov Bond",
      creditRating: "AAA",
      interestRate: 2.0,
      loanAmount: 10_000_000,
      loanId: "loan-3",
      maturityDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.0001);
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
    // capitalRequirement = 10_000_000 × 0.20 × 0.08 = 160_000
    assert.strictEqual(result.capitalRequirement, 160_000);
  });

  it("produces Speculative - Critical for CCC", async () => {
    const input = {
      portfolioId: "p4",
      borrowerName: "Junk Co",
      creditRating: "CCC",
      interestRate: 15.0,
      loanAmount: 200_000,
      loanId: "loan-4",
      maturityDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0.10);
    assert.strictEqual(result.riskBand, "Speculative - Critical");
    // capitalRequirement = 200_000 × 1.50 × 0.08 = 24_000
    assert.strictEqual(result.capitalRequirement, 24_000);
    // expectedLoss = 200_000 × 0.10 × 0.45 = 9_000
    assert.strictEqual(result.expectedLoss, 9_000);
  });

  it("produces Speculative - High for B rating", async () => {
    const input = {
      portfolioId: "p5",
      borrowerName: "Risky Inc",
      creditRating: "B",
      interestRate: 10.0,
      loanAmount: 300_000,
      loanId: "loan-5",
      maturityDate: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000),
    };

    const result = await enrich(input);

    // riskWeight = 1.00, no maturity adjustment → "Speculative - High"
    assert.strictEqual(result.riskBand, "Speculative - High");
  });

  it("populates all simulation output fields with correct types", async () => {
    const input = {
      portfolioId: "p6",
      borrowerName: "Sim Corp",
      creditRating: "BB",
      interestRate: 7.0,
      loanAmount: 500_000,
      loanId: "loan-6",
      maturityDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    };

    const result = await enrich(input);

    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.strictEqual(typeof result.expectedPortfolioLoss, "number");
    assert.strictEqual(typeof result.worstCaseLoss, "number");
    assert.strictEqual(typeof result.tailRiskLoss, "number");
    assert.strictEqual(typeof result.riskNarrative, "string");
    assert.ok(result.riskNarrative.length > 0);
    // simulatedDefaultRate is in [0, 1]
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    // tailRiskLoss >= worstCaseLoss (CVaR >= VaR by definition when losses are non-negative)
    assert.ok(result.tailRiskLoss >= result.worstCaseLoss);
  });

  it("handles zero loan amount without errors", async () => {
    const input = {
      portfolioId: "p7",
      borrowerName: "Zero Corp",
      creditRating: "BBB",
      interestRate: 5.0,
      loanAmount: 0,
      loanId: "loan-7",
      maturityDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    };

    const result = await enrich(input);

    assert.strictEqual(result.capitalRequirement, 0);
    assert.strictEqual(result.expectedLoss, 0);
    assert.strictEqual(result.expectedPortfolioLoss, 0);
    assert.strictEqual(result.worstCaseLoss, 0);
    assert.strictEqual(result.tailRiskLoss, 0);
  });

  it("handles unknown credit rating without throwing", async () => {
    const input = {
      portfolioId: "p8",
      borrowerName: "Unknown",
      creditRating: "UNKNOWN",
      interestRate: 0,
      loanAmount: 100_000,
      loanId: "loan-8",
      maturityDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    };

    const result = await enrich(input);

    assert.strictEqual(result.probabilityOfDefault, 0);
    assert.strictEqual(result.capitalRequirement, 0);
    assert.strictEqual(result.expectedLoss, 0);
    assert.strictEqual(result.riskBand, "Investment Grade - Low");
    assert.strictEqual(typeof result.riskNarrative, "string");
  });
});
