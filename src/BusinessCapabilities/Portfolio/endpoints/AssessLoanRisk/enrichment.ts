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

// Step 1: Credit rating → probability of default (as decimal)
const PD_MAP: Record<string, number> = {
  AAA: 0.0001, // 0.01%
  AA: 0.0002,  // 0.02%
  A: 0.0005,   // 0.05%
  BBB: 0.0020, // 0.20%
  BB: 0.0100,  // 1.00%
  B: 0.0300,   // 3.00%
  CCC: 0.1000, // 10.00%
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

// Step 5: Derive risk band from adjusted risk weight
function getRiskBand(adjustedRiskWeight: number): string {
  if (adjustedRiskWeight <= 0.30) return "Investment Grade - Low";
  if (adjustedRiskWeight <= 0.55) return "Investment Grade - Medium";
  if (adjustedRiskWeight <= 1.00) return "Speculative - High";
  return "Speculative - Critical";
}

const MONTE_CARLO_ITERATIONS = 1000;

export async function enrich(input: AssessLoanRiskEnrichmentInput): Promise<AssessLoanRiskEnrichmentOutput> {
  const { creditRating, loanAmount, maturityDate } = input;

  // Step 1: Map credit rating to probability of default
  const probabilityOfDefault = PD_MAP[creditRating] ?? 0;

  // Step 2: Calculate risk weight with Basel III maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[creditRating] ?? 1.00;
  const yearsToMaturity = (maturityDate.getTime() - Date.now()) / (365.25 * 24 * 60 * 60 * 1000);
  const adjustedRiskWeight = yearsToMaturity > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = loanAmount * adjustedRiskWeight * 0.08;

  // Step 4: Expected loss = loanAmount × PD × LGD (LGD assumption = 45%)
  const expectedLoss = loanAmount * probabilityOfDefault * 0.45;

  // Step 5: Derive risk band from adjusted risk weight
  const riskBand = getRiskBand(adjustedRiskWeight);

  // Step 6: Monte Carlo simulation — 1000 iterations
  const recoveryRate = RECOVERY_RATE_MAP[creditRating] ?? 0.40;
  const lossIfDefault = loanAmount * (1 - recoveryRate);
  const losses: number[] = new Array(MONTE_CARLO_ITERATIONS);
  let defaults = 0;
  let totalLosses = 0;

  for (let i = 0; i < MONTE_CARLO_ITERATIONS; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses[i] = lossIfDefault;
      totalLosses += lossIfDefault;
    } else {
      losses[i] = 0;
    }
  }

  // Step 7: Compute simulation results
  const simulatedDefaultRate = defaults / MONTE_CARLO_ITERATIONS;
  const expectedPortfolioLoss = totalLosses / MONTE_CARLO_ITERATIONS;

  // Sort ascending for percentile calculations
  const sortedLosses = losses.slice().sort((a, b) => a - b);
  // VaR at 95% confidence: loss at the 95th percentile index
  const varIndex = Math.floor(0.95 * MONTE_CARLO_ITERATIONS);
  const worstCaseLoss = sortedLosses[varIndex];
  // CVaR / Expected Shortfall: average of worst 5% scenarios
  const tailLosses = sortedLosses.slice(varIndex);
  const tailRiskLoss = tailLosses.reduce((sum, l) => sum + l, 0) / tailLosses.length;

  // Step 8: Build risk narrative
  const riskNarrative =
    `${creditRating} loan ($${loanAmount}): ${riskBand}. ` +
    `Simulated default rate: ${(simulatedDefaultRate * 100).toFixed(2)}%. ` +
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
