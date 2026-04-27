import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;
const TOLERANCE = 0.001;

describe("AssessLoanRisk Enrichment", () => {
  it("passes through all input fields unchanged", async () => {
    const maturityDate = new Date(Date.now() + 3 * MS_PER_YEAR);
    const input = {
      portfolioId: "port-001",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 5.5,
      loanAmount: 1_000_000,
      loanId: "loan-001",
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

  it("computes deterministic risk fields for BBB rating with maturity ≤ 5 years", async () => {
    // maturity 3 years from now — no Basel III maturity adjustment (≤ 5yr)
    const maturityDate = new Date(Date.now() + 3 * MS_PER_YEAR);
    const input = {
      portfolioId: "port-001",
      borrowerName: "Acme Corp",
      creditRating: "BBB",
      interestRate: 5.5,
      loanAmount: 1_000_000,
      loanId: "loan-001",
      maturityDate,
    };

    const result = await enrich(input);

    // acquisitionDate is set at enrichment time
    assert.ok(result.acquisitionDate instanceof Date);

    // Step 1: BBB → PD = 0.20% = 0.0020
    assert.strictEqual(result.probabilityOfDefault, 0.0020);

    // Step 2: BBB base risk weight = 0.50; maturity 3yr ≤ 5yr → no adjustment → 0.50
    // Step 3: capitalRequirement = 1_000_000 × 0.50 × 0.08 = 40_000
    assert.ok(Math.abs(result.capitalRequirement - 40_000) < TOLERANCE);

    // Step 4: expectedLoss = 1_000_000 × 0.0020 × 0.45 (LGD) = 900
    assert.ok(Math.abs(result.expectedLoss - 900) < TOLERANCE);

    // Step 5: adjustedRiskWeight = 0.50 ≤ 0.55 → "Investment Grade - Medium"
    assert.strictEqual(result.riskBand, "Investment Grade - Medium");

    // Steps 6-7: Monte Carlo results are stochastic — verify type and non-negative range
    assert.strictEqual(typeof result.simulatedDefaultRate, "number");
    assert.ok(result.simulatedDefaultRate >= 0 && result.simulatedDefaultRate <= 1);
    assert.ok(result.expectedPortfolioLoss >= 0);
    assert.ok(result.worstCaseLoss >= 0);
    assert.ok(result.tailRiskLoss >= 0);

    // Step 8: narrative contains credit rating and risk band
    assert.ok(typeof result.riskNarrative === "string" && result.riskNarrative.length > 0);
    assert.ok(result.riskNarrative.includes("BBB"));
    assert.ok(result.riskNarrative.includes("Investment Grade - Medium"));
  });

  it("applies Basel III maturity adjustment for BBB rating with maturity > 5 years", async () => {
    // maturity 7 years from now — adjustment applies (> 5yr)
    const maturityDate = new Date(Date.now() + 7 * MS_PER_YEAR);
    const input = {
      portfolioId: "port-002",
      borrowerName: "Beta LLC",
      creditRating: "BBB",
      interestRate: 6.0,
      loanAmount: 2_000_000,
      loanId: "loan-002",
      maturityDate,
    };

    const result = await enrich(input);

    // Step 2: BBB base risk weight = 0.50; maturity 7yr > 5yr → 0.50 × 1.15 = 0.575
    // Step 3: capitalRequirement = 2_000_000 × 0.575 × 0.08 = 92_000
    assert.ok(Math.abs(result.capitalRequirement - 92_000) < TOLERANCE);

    // Step 4: expectedLoss = 2_000_000 × 0.0020 × 0.45 (LGD) = 1_800
    assert.ok(Math.abs(result.expectedLoss - 1_800) < TOLERANCE);

    // Step 5: adjustedRiskWeight = 0.575 > 0.55 → "Speculative - High"
    assert.strictEqual(result.riskBand, "Speculative - High");
  });
});
