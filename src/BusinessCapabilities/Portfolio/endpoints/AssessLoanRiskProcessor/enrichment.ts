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

// Step 1: Probability of Default (as fraction, e.g. 0.0001 = 0.01%)
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

// Step 5: Derive risk band from adjusted risk weight
function getRiskBand(adjustedRiskWeight: number): string {
  if (adjustedRiskWeight <= 0.30) return "Investment Grade - Low";
  if (adjustedRiskWeight <= 0.55) return "Investment Grade - Medium";
  if (adjustedRiskWeight <= 1.00) return "Speculative - High";
  return "Speculative - Critical";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const FIVE_YEARS_MS = 5 * 365.25 * 24 * 60 * 60 * 1000;
const MONTE_CARLO_ITERATIONS = 1000;
const TAIL_FRACTION = 0.05; // 5% for VaR/CVaR at 95% confidence

export async function enrich(input: AssessLoanRiskProcessorEnrichmentInput): Promise<AssessLoanRiskProcessorEnrichmentOutput> {
  const acquisitionDate = new Date();

  // Step 1: Map credit rating to probability of default
  const probabilityOfDefault = PD_MAP[input.creditRating] ?? 0;

  // Step 2: Calculate risk weight with Basel III; adjust for maturity > 5 years
  const baseRiskWeight = RISK_WEIGHT_MAP[input.creditRating] ?? 0;
  const maturityMs = (input.maturityDate instanceof Date ? input.maturityDate : new Date(input.maturityDate as unknown as string)).getTime();
  const isLongMaturity = maturityMs - Date.now() > FIVE_YEARS_MS;
  const adjustedRiskWeight = isLongMaturity
    ? Math.round(baseRiskWeight * 1.15 * 10000) / 10000
    : baseRiskWeight;

  // Step 3: Capital requirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = round2(input.loanAmount * adjustedRiskWeight * 0.08);

  // Step 4: Expected loss = loanAmount × PD × 0.45 (LGD assumption)
  const expectedLoss = round2(input.loanAmount * probabilityOfDefault * 0.45);

  // Step 5: Risk band from adjusted risk weight
  const riskBand = getRiskBand(adjustedRiskWeight);

  // Step 6: Monte Carlo simulation — 1000 iterations
  const recoveryRate = RECOVERY_RATE_MAP[input.creditRating] ?? 0;
  const lossPerDefault = input.loanAmount * (1 - recoveryRate);
  const losses: number[] = new Array(MONTE_CARLO_ITERATIONS);
  let defaults = 0;

  for (let i = 0; i < MONTE_CARLO_ITERATIONS; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses[i] = lossPerDefault;
    } else {
      losses[i] = 0;
    }
  }

  // Step 7: Compute simulation results
  const simulatedDefaultRate = Math.round((defaults / MONTE_CARLO_ITERATIONS) * 1000000) / 1000000;

  const totalLoss = losses.reduce((sum, l) => sum + l, 0);
  const expectedPortfolioLoss = round2(totalLoss / MONTE_CARLO_ITERATIONS);

  // Sort descending to find worst-case (VaR) and tail-risk (CVaR) values
  const sortedLosses = [...losses].sort((a, b) => b - a);
  const tailCount = Math.floor(MONTE_CARLO_ITERATIONS * TAIL_FRACTION); // 50 scenarios

  // VaR(95%): the loss at the 95th percentile boundary (50th worst out of 1000)
  const worstCaseLoss = round2(tailCount > 0 ? sortedLosses[tailCount - 1] : 0);

  // CVaR / Expected Shortfall: average of the worst 5% scenarios
  const tailLosses = sortedLosses.slice(0, tailCount);
  const tailRiskLoss = round2(
    tailLosses.length > 0
      ? tailLosses.reduce((sum, l) => sum + l, 0) / tailLosses.length
      : 0
  );

  // Step 8: Build risk narrative
  const riskNarrative =
    `${input.creditRating} loan ($${input.loanAmount}): ${riskBand}. ` +
    `Simulated default rate: ${simulatedDefaultRate}%. ` +
    `Expected loss: $${expectedPortfolioLoss}. ` +
    `VaR(95%): $${worstCaseLoss}. ` +
    `Tail risk: $${tailRiskLoss}`;

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
