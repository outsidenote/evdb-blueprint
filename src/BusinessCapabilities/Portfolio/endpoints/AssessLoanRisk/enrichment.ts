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
  AAA: 0.0001,
  AA: 0.0002,
  A: 0.0005,
  BBB: 0.002,
  BB: 0.01,
  B: 0.03,
  CCC: 0.10,
};

const RISK_WEIGHT_MAP: Record<string, number> = {
  AAA: 0.20,
  AA: 0.25,
  A: 0.35,
  BBB: 0.50,
  BB: 0.75,
  B: 1.00,
  CCC: 1.50,
};

const RECOVERY_RATE_MAP: Record<string, number> = {
  AAA: 0.70,
  AA: 0.70,
  A: 0.70,
  BBB: 0.55,
  BB: 0.40,
  B: 0.30,
  CCC: 0.20,
};

function getRiskBand(adjustedRiskWeight: number): string {
  if (adjustedRiskWeight <= 0.30) return "Investment Grade - Low";
  if (adjustedRiskWeight <= 0.55) return "Investment Grade - Medium";
  if (adjustedRiskWeight <= 1.00) return "Speculative - High";
  return "Speculative - Critical";
}

export async function enrich(input: AssessLoanRiskEnrichmentInput): Promise<AssessLoanRiskEnrichmentOutput> {
  const acquisitionDate = new Date();

  // Step 1: probability of default
  const probabilityOfDefault = PD_MAP[input.creditRating] ?? 0;

  // Step 2: risk weight with Basel III maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[input.creditRating] ?? 1.0;
  const yearsToMaturity = (input.maturityDate.getTime() - acquisitionDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  const adjustedRiskWeight = yearsToMaturity > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: capital requirement
  const capitalRequirement = input.loanAmount * adjustedRiskWeight * 0.08;

  // Step 4: expected loss (LGD = 45%)
  const expectedLoss = input.loanAmount * probabilityOfDefault * 0.45;

  // Step 5: risk band
  const riskBand = getRiskBand(adjustedRiskWeight);

  // Steps 6 & 7: Monte Carlo simulation (1000 iterations)
  const ITERATIONS = 1000;
  const recoveryRate = RECOVERY_RATE_MAP[input.creditRating] ?? 0.40;
  const losses: number[] = [];
  let defaults = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    const random = Math.random();
    if (random < probabilityOfDefault) {
      defaults++;
      losses.push(input.loanAmount * (1 - recoveryRate));
    } else {
      losses.push(0);
    }
  }

  const simulatedDefaultRate = defaults / ITERATIONS;
  const expectedPortfolioLoss = losses.reduce((a, b) => a + b, 0) / ITERATIONS;

  // Sort ascending for percentile calculations
  const sortedLossesAsc = [...losses].sort((a, b) => a - b);
  const tailStartIndex = Math.floor(ITERATIONS * 0.95); // index 950 = VaR(95%)
  const worstCaseLoss = sortedLossesAsc[tailStartIndex];

  // CVaR / Expected Shortfall: average of worst 5% scenarios
  const tailLosses = sortedLossesAsc.slice(tailStartIndex);
  const tailRiskLoss = tailLosses.reduce((a, b) => a + b, 0) / tailLosses.length;

  // Step 8: risk narrative
  const riskNarrative =
    `${input.creditRating} loan ($${input.loanAmount}): ${riskBand}. ` +
    `Simulated default rate: ${(simulatedDefaultRate * 100).toFixed(2)}%. ` +
    `Expected loss: $${expectedPortfolioLoss.toFixed(2)}. ` +
    `VaR(95%): $${worstCaseLoss.toFixed(2)}. ` +
    `Tail risk: $${tailRiskLoss.toFixed(2)}`;

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
