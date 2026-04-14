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

const PD_MAP: Record<string, number> = {
  AAA: 0.0001,
  AA:  0.0002,
  A:   0.0005,
  BBB: 0.002,
  BB:  0.01,
  B:   0.03,
  CCC: 0.10,
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

const FIVE_YEARS_MS = 5 * 365.25 * 24 * 60 * 60 * 1000;
const MONTE_CARLO_ITERATIONS = 1000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function enrich(input: AssessLoanRiskProcessorEnrichmentInput): Promise<AssessLoanRiskProcessorEnrichmentOutput> {
  const { creditRating, loanAmount, maturityDate } = input;

  // Step 1: Map credit rating to probability of default
  const pd = PD_MAP[creditRating] ?? 0.10;

  // Step 2: Basel III risk weight with maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[creditRating] ?? 1.50;
  const isLongMaturity = maturityDate.getTime() - Date.now() > FIVE_YEARS_MS;
  const adjustedRiskWeight = isLongMaturity ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement
  const capitalRequirement = round2(loanAmount * adjustedRiskWeight * 0.08);

  // Step 4: Expected loss (LGD = 45%)
  const expectedLoss = round2(loanAmount * pd * 0.45);

  // Step 5: Risk band from adjusted risk weight
  let riskBand: string;
  if (adjustedRiskWeight <= 0.30) riskBand = "Investment Grade - Low";
  else if (adjustedRiskWeight <= 0.55) riskBand = "Investment Grade - Medium";
  else if (adjustedRiskWeight <= 1.00) riskBand = "Speculative - High";
  else riskBand = "Speculative - Critical";

  // Step 6: Monte Carlo simulation (1000 iterations)
  const recoveryRate = RECOVERY_RATE_MAP[creditRating] ?? 0.20;
  let defaults = 0;
  const losses: number[] = [];

  for (let i = 0; i < MONTE_CARLO_ITERATIONS; i++) {
    if (Math.random() < pd) {
      defaults++;
      losses.push(loanAmount * (1 - recoveryRate));
    } else {
      losses.push(0);
    }
  }

  // Step 7: Simulation results
  const simulatedDefaultRate = round2((defaults / MONTE_CARLO_ITERATIONS) * 100);
  const expectedPortfolioLoss = round2(losses.reduce((sum, l) => sum + l, 0) / MONTE_CARLO_ITERATIONS);

  losses.sort((a, b) => a - b);
  const varIndex = Math.floor(MONTE_CARLO_ITERATIONS * 0.95);
  const worstCaseLoss = round2(losses[varIndex]);
  const tailLosses = losses.slice(varIndex);
  const tailRiskLoss = round2(tailLosses.reduce((sum, l) => sum + l, 0) / tailLosses.length);

  // Step 8: Risk narrative
  const riskNarrative = `${creditRating} loan ($${loanAmount}): ${riskBand}. Simulated default rate: ${simulatedDefaultRate}%. Expected loss: $${expectedPortfolioLoss}. VaR(95%): $${worstCaseLoss}. Tail risk: $${tailRiskLoss}`;

  return {
    ...input,
    acquisitionDate: new Date(),
    capitalRequirement,
    expectedLoss,
    probabilityOfDefault: pd,
    riskBand,
    simulatedDefaultRate,
    expectedPortfolioLoss,
    worstCaseLoss,
    tailRiskLoss,
    riskNarrative,
  };
}
