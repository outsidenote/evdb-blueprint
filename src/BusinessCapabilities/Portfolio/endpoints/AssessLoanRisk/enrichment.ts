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

// Step 1: PD by credit rating (as decimal, e.g. 0.0001 = 0.01%)
const PD_MAP: Record<string, number> = {
  AAA: 0.0001,
  AA: 0.0002,
  A: 0.0005,
  BBB: 0.002,
  BB: 0.01,
  B: 0.03,
  CCC: 0.10,
};

// Step 2: Basel III standardised risk weight by credit rating
const RISK_WEIGHT_MAP: Record<string, number> = {
  AAA: 0.20,
  AA: 0.25,
  A: 0.35,
  BBB: 0.50,
  BB: 0.75,
  B: 1.00,
  CCC: 1.50,
};

// Step 6: Recovery rate by rating group
const RECOVERY_RATE_MAP: Record<string, number> = {
  AAA: 0.70,
  AA: 0.70,
  A: 0.70,
  BBB: 0.55,
  BB: 0.40,
  B: 0.30,
  CCC: 0.20,
};

const FIVE_YEARS_MS = 5 * 365.25 * 24 * 60 * 60 * 1000;
const MONTE_CARLO_ITERATIONS = 1000;

export async function enrich(input: AssessLoanRiskEnrichmentInput): Promise<AssessLoanRiskEnrichmentOutput> {
  const { creditRating, loanAmount, maturityDate } = input;

  // Step 1: Map credit rating to PD (default to BBB for unknown ratings)
  const probabilityOfDefault = PD_MAP[creditRating] ?? PD_MAP["BBB"];

  // Step 2: Basel III risk weight with maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[creditRating] ?? RISK_WEIGHT_MAP["BBB"];
  const maturityMs = maturityDate instanceof Date ? maturityDate.getTime() : NaN;
  const isLongDated = !isNaN(maturityMs) && maturityMs - Date.now() > FIVE_YEARS_MS;
  const adjustedRiskWeight = isLongDated ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement = loanAmount × adjustedRiskWeight × 8% (Basel minimum)
  const capitalRequirement = loanAmount * adjustedRiskWeight * 0.08;

  // Step 4: Expected loss = loanAmount × PD × LGD (45% assumption)
  const expectedLoss = loanAmount * probabilityOfDefault * 0.45;

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

  // Step 6 & 7: Monte Carlo simulation
  const recoveryRate = RECOVERY_RATE_MAP[creditRating] ?? RECOVERY_RATE_MAP["BBB"];
  const lossOnDefault = loanAmount * (1 - recoveryRate);
  const losses: number[] = [];
  let defaults = 0;

  for (let i = 0; i < MONTE_CARLO_ITERATIONS; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses.push(lossOnDefault);
    } else {
      losses.push(0);
    }
  }

  const simulatedDefaultRate = defaults / MONTE_CARLO_ITERATIONS;
  const expectedPortfolioLoss = losses.reduce((sum, l) => sum + l, 0) / MONTE_CARLO_ITERATIONS;

  const sortedLosses = [...losses].sort((a, b) => a - b);
  const varIndex = Math.floor(MONTE_CARLO_ITERATIONS * 0.95);
  const worstCaseLoss = sortedLosses[varIndex];
  const tailSlice = sortedLosses.slice(varIndex);
  const tailRiskLoss = tailSlice.length > 0
    ? tailSlice.reduce((sum, l) => sum + l, 0) / tailSlice.length
    : 0;

  // Step 8: Risk narrative
  const riskNarrative =
    `${creditRating} loan ($${loanAmount.toFixed(2)}): ${riskBand}. ` +
    `Simulated default rate: ${(simulatedDefaultRate * 100).toFixed(4)}%. ` +
    `Expected loss: $${expectedPortfolioLoss.toFixed(2)}. ` +
    `VaR(95%): $${worstCaseLoss.toFixed(2)}. ` +
    `Tail risk: $${tailRiskLoss.toFixed(2)}`;

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
