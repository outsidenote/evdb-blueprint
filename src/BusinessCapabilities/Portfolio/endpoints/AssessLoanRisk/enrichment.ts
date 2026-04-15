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

const PD_MAP: Record<string, number> = {
  AAA: 0.0001,  // 0.01%
  AA:  0.0002,  // 0.02%
  A:   0.0005,  // 0.05%
  BBB: 0.0020,  // 0.20%
  BB:  0.0100,  // 1.00%
  B:   0.0300,  // 3.00%
  CCC: 0.1000,  // 10.00%
};

const RISK_WEIGHT_MAP: Record<string, number> = {
  AAA: 0.20,
  AA:  0.25,
  A:   0.35,
  BBB: 0.50,
  BB:  0.75,
  B:   1.00,
  CCC: 1.50,
};

const RECOVERY_RATE_MAP: Record<string, number> = {
  AAA: 0.70,
  AA:  0.70,
  A:   0.70,
  BBB: 0.55,
  BB:  0.40,
  B:   0.30,
  CCC: 0.20,
};

const MONTE_CARLO_ITERATIONS = 1000;
const LGD = 0.45;
const CAPITAL_RATIO = 0.08;
const MATURITY_ADJUSTMENT = 1.15;
const FIVE_YEARS_MS = 5 * 365.25 * 24 * 60 * 60 * 1000;

export async function enrich(input: AssessLoanRiskEnrichmentInput): Promise<AssessLoanRiskEnrichmentOutput> {
  const { loanAmount, creditRating } = input;

  // Step 1: Map credit rating to probability of default
  const probabilityOfDefault = PD_MAP[creditRating] ?? 0;

  // Step 2: Basel III risk weight with maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[creditRating] ?? 0;
  const maturityMs = input.maturityDate instanceof Date
    ? input.maturityDate.getTime()
    : new Date(input.maturityDate as unknown as string).getTime();
  const fiveYearsFromNow = Date.now() + FIVE_YEARS_MS;
  const adjustedRiskWeight = maturityMs > fiveYearsFromNow
    ? baseRiskWeight * MATURITY_ADJUSTMENT
    : baseRiskWeight;

  // Step 3: Capital requirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = loanAmount * adjustedRiskWeight * CAPITAL_RATIO;

  // Step 4: Expected loss = loanAmount × PD × LGD (45%)
  const expectedLoss = loanAmount * probabilityOfDefault * LGD;

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

  // Step 6 & 7: Monte Carlo simulation (1000 iterations)
  const recoveryRate = RECOVERY_RATE_MAP[creditRating] ?? 0.55;
  const losses: number[] = new Array(MONTE_CARLO_ITERATIONS);
  let defaults = 0;

  for (let i = 0; i < MONTE_CARLO_ITERATIONS; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses[i] = loanAmount * (1 - recoveryRate);
    } else {
      losses[i] = 0;
    }
  }

  const simulatedDefaultRate = defaults / MONTE_CARLO_ITERATIONS;
  const expectedPortfolioLoss = losses.reduce((sum, l) => sum + l, 0) / MONTE_CARLO_ITERATIONS;

  // Sort ascending for percentile calculations
  const sortedLosses = [...losses].sort((a, b) => a - b);

  // VaR at 95%: value at index 950 (0-indexed) of 1000 sorted losses
  const worstCaseLoss = sortedLosses[950];

  // CVaR / Expected Shortfall: average of worst 5% (top 50 losses, indices 950–999)
  const tailRiskLoss = sortedLosses.slice(950).reduce((sum, l) => sum + l, 0) / 50;

  // Step 8: Risk narrative
  const riskNarrative = `${creditRating} loan ($${loanAmount}): ${riskBand}. Simulated default rate: ${simulatedDefaultRate}%. Expected loss: $${expectedPortfolioLoss}. VaR(95%): $${worstCaseLoss}. Tail risk: $${tailRiskLoss}`;

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
