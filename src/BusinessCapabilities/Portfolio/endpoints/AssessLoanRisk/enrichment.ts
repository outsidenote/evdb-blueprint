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

// Step 1: Probability of Default by credit rating
const PD_MAP: Record<string, number> = {
  AAA: 0.0001,
  AA: 0.0002,
  A: 0.0005,
  BBB: 0.0020,
  BB: 0.0100,
  B: 0.0300,
  CCC: 0.1000,
};

// Step 2: Basel III standardised risk weights
const RISK_WEIGHT_MAP: Record<string, number> = {
  AAA: 0.20,
  AA: 0.25,
  A: 0.35,
  BBB: 0.50,
  BB: 0.75,
  B: 1.00,
  CCC: 1.50,
};

// Step 6: Recovery rates used in Monte Carlo loss calculation
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

export async function enrich(input: AssessLoanRiskEnrichmentInput): Promise<AssessLoanRiskEnrichmentOutput> {
  const acquisitionDate = new Date();

  // Step 1: Map credit rating to PD (default to CCC for unknown ratings)
  const probabilityOfDefault = PD_MAP[input.creditRating] ?? PD_MAP["CCC"];

  // Step 2: Calculate risk weight with Basel III maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[input.creditRating] ?? RISK_WEIGHT_MAP["CCC"];
  const yearsToMaturity =
    (input.maturityDate.getTime() - acquisitionDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const adjustedRiskWeight = yearsToMaturity > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = input.loanAmount * adjustedRiskWeight * 0.08;

  // Step 4: Expected loss = loanAmount × PD × LGD (45%)
  const expectedLoss = input.loanAmount * probabilityOfDefault * 0.45;

  // Step 5: Risk band
  const riskBand = getRiskBand(adjustedRiskWeight);

  // Step 6: Monte Carlo simulation — 1000 iterations
  const SIMULATIONS = 1000;
  const recoveryRate = RECOVERY_RATE_MAP[input.creditRating] ?? RECOVERY_RATE_MAP["CCC"];
  const lossPerDefault = input.loanAmount * (1 - recoveryRate);
  const losses: number[] = [];
  let defaults = 0;

  for (let i = 0; i < SIMULATIONS; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses.push(lossPerDefault);
    } else {
      losses.push(0);
    }
  }

  // Step 7: Compute simulation statistics
  const simulatedDefaultRate = defaults / SIMULATIONS;
  const expectedPortfolioLoss = losses.reduce((sum, l) => sum + l, 0) / SIMULATIONS;

  const sortedLosses = [...losses].sort((a, b) => a - b);
  const tailStart = Math.floor(0.95 * SIMULATIONS); // index 950 = 95th percentile (VaR)
  const worstCaseLoss = sortedLosses[tailStart];
  const tailLosses = sortedLosses.slice(tailStart); // worst 5% scenarios (CVaR)
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
    acquisitionDate,
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
