export interface AssessLoanRiskEnrichmentInput {
  readonly portfolioId: string;
  readonly borrowerName: string;
  readonly creditRating: string;
  readonly interestRate: number;
  readonly loanAmount: number;
  readonly loanId: string;
  readonly maturityDate: Date;
}

export interface AssessLoanRiskEnrichmentOutput extends AssessLoanRiskEnrichmentInput {
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

// Step 1: Probability of Default (PD) by credit rating
const PD_MAP: Record<string, number> = {
  AAA: 0.0001,
  AA:  0.0002,
  A:   0.0005,
  BBB: 0.002,
  BB:  0.01,
  B:   0.03,
  CCC: 0.10,
};

// Step 2: Basel III standardized risk weights
const RISK_WEIGHT_MAP: Record<string, number> = {
  AAA: 0.20,
  AA:  0.25,
  A:   0.35,
  BBB: 0.50,
  BB:  0.75,
  B:   1.00,
  CCC: 1.50,
};

// Step 6: Recovery rates by rating group
const RECOVERY_RATE_MAP: Record<string, number> = {
  AAA: 0.70,
  AA:  0.70,
  A:   0.70,
  BBB: 0.55,
  BB:  0.40,
  B:   0.30,
  CCC: 0.20,
};

export async function enrich(input: AssessLoanRiskEnrichmentInput): Promise<AssessLoanRiskEnrichmentOutput> {
  const maturityDate = input.maturityDate instanceof Date
    ? input.maturityDate
    : new Date(input.maturityDate as unknown as string);

  // Step 1: Probability of Default
  const probabilityOfDefault = PD_MAP[input.creditRating] ?? NaN;

  // Step 2: Risk weight with maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[input.creditRating] ?? NaN;
  const yearsToMaturity = (maturityDate.getTime() - Date.now()) / (365.25 * 24 * 60 * 60 * 1000);
  const adjustedRiskWeight = yearsToMaturity > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = input.loanAmount * adjustedRiskWeight * 0.08;

  // Step 4: Expected loss = loanAmount × PD × LGD (45%)
  const expectedLoss = input.loanAmount * probabilityOfDefault * 0.45;

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
  const recoveryRate = RECOVERY_RATE_MAP[input.creditRating] ?? NaN;
  const losses: number[] = [];
  let defaults = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses.push(input.loanAmount * (1 - recoveryRate));
    } else {
      losses.push(0);
    }
  }

  // Step 7: Simulation results
  losses.sort((a, b) => a - b);

  const simulatedDefaultRate = defaults / ITERATIONS;
  const expectedPortfolioLoss = losses.reduce((sum, l) => sum + l, 0) / ITERATIONS;

  // VaR at 95% confidence: loss at the 95th percentile
  const var95Index = Math.floor(0.95 * ITERATIONS); // index 950
  const worstCaseLoss = losses[var95Index];

  // CVaR / Expected Shortfall: average of worst 5% scenarios (top 50)
  const tailLosses = losses.slice(var95Index);
  const tailRiskLoss = tailLosses.reduce((sum, l) => sum + l, 0) / tailLosses.length;

  // Step 8: Risk narrative
  const riskNarrative =
    `${input.creditRating} loan ($${input.loanAmount}): ${riskBand}. ` +
    `Simulated default rate: ${(simulatedDefaultRate * 100).toFixed(2)}%. ` +
    `Expected loss: $${expectedPortfolioLoss.toFixed(2)}. ` +
    `VaR(95%): $${worstCaseLoss.toFixed(2)}. ` +
    `Tail risk: $${tailRiskLoss.toFixed(2)}`;

  return {
    ...input,
    acquisitionDate: new Date(),
    probabilityOfDefault,
    capitalRequirement,
    expectedLoss,
    riskBand,
    simulatedDefaultRate,
    expectedPortfolioLoss,
    worstCaseLoss,
    tailRiskLoss,
    riskNarrative,
  };
}
