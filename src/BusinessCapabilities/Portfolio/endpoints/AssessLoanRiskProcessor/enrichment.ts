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

const MONTE_CARLO_ITERATIONS = 1000;

export async function enrich(input: AssessLoanRiskProcessorEnrichmentInput): Promise<AssessLoanRiskProcessorEnrichmentOutput> {
  const { creditRating, loanAmount, maturityDate } = input;

  // Step 1: Map credit rating to probability of default
  const probabilityOfDefault = PD_MAP[creditRating] ?? 0;

  // Step 2: Calculate risk weight with maturity adjustment (Basel III)
  const baseRiskWeight = RISK_WEIGHT_MAP[creditRating] ?? 1.00;
  const now = new Date();
  const maturityYears = (maturityDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  const adjustedRiskWeight = maturityYears > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Calculate capital requirement
  const capitalRequirement = Math.round(loanAmount * adjustedRiskWeight * 0.08 * 100) / 100;

  // Step 4: Calculate expected loss (LGD assumption 45%)
  const expectedLoss = Math.round(loanAmount * probabilityOfDefault * 0.45 * 100) / 100;

  // Step 5: Derive risk band from adjusted risk weight
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
  const recoveryRate = RECOVERY_RATE_MAP[creditRating] ?? 0.30;
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

  // Step 7: Compute simulation results
  const simulatedDefaultRate = Math.round((defaults / MONTE_CARLO_ITERATIONS) * 10000) / 10000;
  const totalLoss = losses.reduce((sum, l) => sum + l, 0);
  const expectedPortfolioLoss = Math.round((totalLoss / MONTE_CARLO_ITERATIONS) * 100) / 100;

  const sortedLosses = [...losses].sort((a, b) => a - b);
  const var95Index = Math.floor(MONTE_CARLO_ITERATIONS * 0.95);
  const worstCaseLoss = Math.round(sortedLosses[var95Index] * 100) / 100;

  const tailLosses = sortedLosses.slice(var95Index);
  const tailRiskLoss = tailLosses.length > 0
    ? Math.round((tailLosses.reduce((sum, l) => sum + l, 0) / tailLosses.length) * 100) / 100
    : 0;

  // Step 8: Build risk narrative
  const riskNarrative = `${creditRating} loan ($${loanAmount}): ${riskBand}. Simulated default rate: ${simulatedDefaultRate}%. Expected loss: $${expectedPortfolioLoss}. VaR(95%): $${worstCaseLoss}. Tail risk: $${tailRiskLoss}`;

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
