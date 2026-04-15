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

// Step 1: Probability of default by credit rating
const PD_MAP: Record<string, number> = {
  AAA: 0.0001,
  AA: 0.0002,
  A: 0.0005,
  BBB: 0.0020,
  BB: 0.0100,
  B: 0.0300,
  CCC: 0.1000,
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
  const acquisitionDate = new Date();

  // Step 1: Probability of default
  const probabilityOfDefault = PD_MAP[input.creditRating] ?? 0.0020;

  // Step 2: Risk weight with maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[input.creditRating] ?? 1.00;
  const yearsToMaturity = (input.maturityDate.getTime() - acquisitionDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  const adjustedRiskWeight = yearsToMaturity > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = Math.round(input.loanAmount * adjustedRiskWeight * 0.08 * 100) / 100;

  // Step 4: Expected loss = loanAmount × PD × 0.45 (LGD assumption 45%)
  const expectedLoss = Math.round(input.loanAmount * probabilityOfDefault * 0.45 * 100) / 100;

  // Step 5: Risk band from adjusted risk weight
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
  const ITERATIONS = 1000;
  const recoveryRate = RECOVERY_RATE_MAP[input.creditRating] ?? 0.50;
  let defaults = 0;
  let totalLosses = 0;
  const allLosses: number[] = new Array(ITERATIONS);

  for (let i = 0; i < ITERATIONS; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      const loss = input.loanAmount * (1 - recoveryRate);
      totalLosses += loss;
      allLosses[i] = loss;
    } else {
      allLosses[i] = 0;
    }
  }

  // Step 7: Simulation results
  const simulatedDefaultRate = defaults / ITERATIONS;
  const expectedPortfolioLoss = Math.round((totalLosses / ITERATIONS) * 100) / 100;

  const sortedLosses = [...allLosses].sort((a, b) => a - b);
  const varIdx = Math.floor(0.95 * ITERATIONS); // 95th percentile index
  const worstCaseLoss = Math.round(sortedLosses[varIdx] * 100) / 100;

  // CVaR: average of worst 5% scenarios (indices varIdx..999)
  const tailScenarios = sortedLosses.slice(varIdx);
  const tailRiskLoss = Math.round(
    (tailScenarios.reduce((sum, l) => sum + l, 0) / tailScenarios.length) * 100
  ) / 100;

  // Step 8: Risk narrative
  const riskNarrative = `${input.creditRating} loan ($${input.loanAmount}): ${riskBand}. Simulated default rate: ${(simulatedDefaultRate * 100).toFixed(2)}%. Expected loss: $${expectedPortfolioLoss.toFixed(2)}. VaR(95%): $${worstCaseLoss.toFixed(2)}. Tail risk: $${tailRiskLoss.toFixed(2)}`;

  return {
    ...input,
    acquisitionDate,
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
