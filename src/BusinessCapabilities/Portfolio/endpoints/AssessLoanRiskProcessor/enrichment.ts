export interface AssessLoanRiskProcessorEnrichmentInput {
  readonly portfolioId: string;
  readonly borrowerName: string;
  readonly creditRating: string;
  readonly interestRate: number;
  readonly loanAmount: number;
  readonly loanId: string;
  readonly maturityDate: Date;
}

export interface AssessLoanRiskProcessorEnrichmentOutput extends AssessLoanRiskProcessorEnrichmentInput {
  readonly acquisitionDate: Date;
  readonly capitalRequirement: number;
  readonly expectedLoss: number;
  readonly probabilityOfDefault: number;
  readonly riskBand: string;
  readonly simulatedDefaultRate: number;
  readonly expectedPortfolioLoss: number;
  readonly worstCaseLoss: number;
  readonly tailRiskLoss: number;
  readonly riskNarrative: string;
}

// Step 1: PD map — values are decimals (e.g. 0.0001 = 0.01%)
const PD_MAP: Record<string, number> = {
  AAA: 0.0001,
  AA: 0.0002,
  A: 0.0005,
  BBB: 0.002,
  BB: 0.01,
  B: 0.03,
  CCC: 0.10,
};

// Step 2: Basel III standardized risk weights
const RISK_WEIGHT_MAP: Record<string, number> = {
  AAA: 0.20,
  AA: 0.25,
  A: 0.35,
  BBB: 0.50,
  BB: 0.75,
  B: 1.00,
  CCC: 1.50,
};

// Step 6: Recovery rates by rating group
const RECOVERY_RATE_MAP: Record<string, number> = {
  AAA: 0.70,
  AA: 0.70,
  A: 0.70,
  BBB: 0.55,
  BB: 0.40,
  B: 0.30,
  CCC: 0.20,
};

export async function enrich(input: AssessLoanRiskProcessorEnrichmentInput): Promise<AssessLoanRiskProcessorEnrichmentOutput> {
  const { creditRating, loanAmount, maturityDate } = input;

  // Step 1: Map credit rating to probability of default
  const probabilityOfDefault = PD_MAP[creditRating] ?? 0;

  // Step 2: Risk weight with maturity adjustment (> 5 years → ×1.15)
  const baseRiskWeight = RISK_WEIGHT_MAP[creditRating] ?? 0;
  const fiveYearsFromNow = new Date();
  fiveYearsFromNow.setFullYear(fiveYearsFromNow.getFullYear() + 5);
  const isLongMaturity = maturityDate > fiveYearsFromNow;
  const adjustedRiskWeight = isLongMaturity ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: capitalRequirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = Math.round(loanAmount * adjustedRiskWeight * 0.08 * 100) / 100;

  // Step 4: expectedLoss = loanAmount × PD × 0.45 (LGD assumption 45%)
  const expectedLoss = Math.round(loanAmount * probabilityOfDefault * 0.45 * 100) / 100;

  // Step 5: riskBand from adjusted risk weight
  let riskBand: string;
  if (adjustedRiskWeight <= 0.30) {
    riskBand = "Investment Grade - Low";
  } else if (adjustedRiskWeight <= 0.55) {
    riskBand = "Investment Grade - Medium";
  } else if (adjustedRiskWeight <= 1.00) {
    riskBand = "Speculative - High";
  } else {
    riskBand = "Speculative - Critical";
  }

  // Step 6: Monte Carlo simulation (1000 iterations)
  const recoveryRate = RECOVERY_RATE_MAP[creditRating] ?? 0.50;
  const iterations = 1000;
  const losses: number[] = [];
  let totalDefaults = 0;

  for (let i = 0; i < iterations; i++) {
    const random = Math.random();
    if (random < probabilityOfDefault) {
      totalDefaults++;
      losses.push(loanAmount * (1 - recoveryRate));
    } else {
      losses.push(0);
    }
  }

  // Step 7: Simulation results
  const simulatedDefaultRate = Math.round((totalDefaults / iterations) * 10000) / 10000;
  const totalLoss = losses.reduce((sum, l) => sum + l, 0);
  const expectedPortfolioLoss = Math.round((totalLoss / iterations) * 100) / 100;

  // VaR at 95% confidence: 95th percentile of sorted losses
  const sortedLosses = [...losses].sort((a, b) => a - b);
  const varIndex = Math.floor(0.95 * iterations); // index 950
  const worstCaseLoss = Math.round((sortedLosses[varIndex] ?? 0) * 100) / 100;

  // CVaR / Expected Shortfall: average of worst 5% scenarios (indices 950–999)
  const tailLosses = sortedLosses.slice(varIndex);
  const tailRiskLoss = Math.round(
    (tailLosses.reduce((sum, l) => sum + l, 0) / tailLosses.length) * 100
  ) / 100;

  // Step 8: Build riskNarrative
  const simulatedDefaultRatePct = (simulatedDefaultRate * 100).toFixed(2);
  const riskNarrative = `${creditRating} loan ($${loanAmount}): ${riskBand}. Simulated default rate: ${simulatedDefaultRatePct}%. Expected loss: $${expectedPortfolioLoss}. VaR(95%): $${worstCaseLoss}. Tail risk: $${tailRiskLoss}`;

  return {
    ...input,
    acquisitionDate: new Date(),
    capitalRequirement,
    expectedLoss,
    probabilityOfDefault,
    riskBand,
    simulatedDefaultRate,
    expectedPortfolioLoss,
    worstCaseLoss,
    tailRiskLoss,
    riskNarrative,
  };
}
