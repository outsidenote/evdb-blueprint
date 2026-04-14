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

// Step 1: PD map (percentages converted to decimals)
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

// Step 5: Risk band from adjusted risk weight
function getRiskBand(adjustedRiskWeight: number): string {
  if (adjustedRiskWeight <= 0.30) return "Investment Grade - Low";
  if (adjustedRiskWeight <= 0.55) return "Investment Grade - Medium";
  if (adjustedRiskWeight <= 1.00) return "Speculative - High";
  return "Speculative - Critical";
}

export async function enrich(input: AssessLoanRiskEnrichmentInput): Promise<AssessLoanRiskEnrichmentOutput> {
  const acquisitionDate = new Date();

  // Step 1: Probability of default
  const probabilityOfDefault = PD_MAP[input.creditRating] ?? 0.1000;

  // Step 2: Risk weight with Basel III maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[input.creditRating] ?? 1.50;
  const yearsToMaturity =
    (input.maturityDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 365.25);
  const adjustedRiskWeight = yearsToMaturity > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement
  const capitalRequirement = input.loanAmount * adjustedRiskWeight * 0.08;

  // Step 4: Expected loss (LGD = 45%)
  const expectedLoss = input.loanAmount * probabilityOfDefault * 0.45;

  // Step 5: Risk band
  const riskBand = getRiskBand(adjustedRiskWeight);

  // Step 6: Monte Carlo simulation (1000 iterations)
  const recoveryRate = RECOVERY_RATE_MAP[input.creditRating] ?? 0.20;
  let defaults = 0;
  const losses: number[] = new Array(1000);

  for (let i = 0; i < 1000; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses[i] = input.loanAmount * (1 - recoveryRate);
    } else {
      losses[i] = 0;
    }
  }

  // Step 7: Simulation results
  const simulatedDefaultRate = defaults / 1000;
  const expectedPortfolioLoss = losses.reduce((sum, l) => sum + l, 0) / 1000;

  const sortedLosses = [...losses].sort((a, b) => a - b);
  const percentile95Index = Math.floor(0.95 * 1000);
  const worstCaseLoss = sortedLosses[percentile95Index];
  const tailSlice = sortedLosses.slice(percentile95Index);
  const tailRiskLoss = tailSlice.reduce((sum, l) => sum + l, 0) / tailSlice.length;

  // Step 8: Risk narrative
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
