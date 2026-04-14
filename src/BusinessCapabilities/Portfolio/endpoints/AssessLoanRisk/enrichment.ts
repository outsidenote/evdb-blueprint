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
  BBB: 0.0020,
  BB: 0.0100,
  B: 0.0300,
  CCC: 0.1000,
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

const ITERATIONS = 1000;

export async function enrich(input: AssessLoanRiskEnrichmentInput): Promise<AssessLoanRiskEnrichmentOutput> {
  const { creditRating, loanAmount, maturityDate } = input;

  // Step 1: Probability of default
  const probabilityOfDefault = PD_MAP[creditRating] ?? PD_MAP["BBB"];

  // Step 2: Risk weight with Basel III maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[creditRating] ?? RISK_WEIGHT_MAP["BBB"];
  const maturityMs = (maturityDate instanceof Date ? maturityDate : new Date(maturityDate as unknown as string)).getTime();
  const yearsToMaturity = (maturityMs - Date.now()) / (1000 * 60 * 60 * 24 * 365.25);
  const adjustedRiskWeight = yearsToMaturity > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement
  const capitalRequirement = Math.round(loanAmount * adjustedRiskWeight * 0.08 * 100) / 100;

  // Step 4: Expected loss (LGD = 45%)
  const expectedLoss = Math.round(loanAmount * probabilityOfDefault * 0.45 * 100) / 100;

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
  const recoveryRate = RECOVERY_RATE_MAP[creditRating] ?? RECOVERY_RATE_MAP["BBB"];
  const losses: number[] = [];
  let defaults = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses.push(loanAmount * (1 - recoveryRate));
    } else {
      losses.push(0);
    }
  }

  // Step 7: Simulation results
  const simulatedDefaultRate = Math.round((defaults / ITERATIONS) * 10000) / 10000;
  const expectedPortfolioLoss = Math.round((losses.reduce((sum, l) => sum + l, 0) / ITERATIONS) * 100) / 100;

  const sortedLosses = [...losses].sort((a, b) => a - b);
  const varIndex = Math.floor(ITERATIONS * 0.95);
  const worstCaseLoss = Math.round(sortedLosses[varIndex] * 100) / 100;

  const tailCount = Math.floor(ITERATIONS * 0.05);
  const tailLosses = sortedLosses.slice(ITERATIONS - tailCount);
  const tailRiskLoss = tailCount > 0
    ? Math.round((tailLosses.reduce((sum, l) => sum + l, 0) / tailCount) * 100) / 100
    : 0;

  // Step 8: Risk narrative
  const simulatedDefaultRatePct = (simulatedDefaultRate * 100).toFixed(2);
  const riskNarrative =
    `${creditRating} loan ($${loanAmount}): ${riskBand}. ` +
    `Simulated default rate: ${simulatedDefaultRatePct}%. ` +
    `Expected loss: $${expectedPortfolioLoss}. ` +
    `VaR(95%): $${worstCaseLoss}. ` +
    `Tail risk: $${tailRiskLoss}`;

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
