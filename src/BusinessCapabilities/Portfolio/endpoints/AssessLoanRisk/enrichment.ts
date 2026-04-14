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

export async function enrich(input: AssessLoanRiskEnrichmentInput): Promise<AssessLoanRiskEnrichmentOutput> {
  const { creditRating, loanAmount, maturityDate } = input;

  // Step 1: probability of default
  const probabilityOfDefault = PD_MAP[creditRating] ?? 0;

  // Step 2: Basel III risk weight with maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[creditRating] ?? 0;
  const now = new Date();
  const fiveYearsFromNow = new Date(now.getFullYear() + 5, now.getMonth(), now.getDate());
  const maturityIsOver5Years =
    maturityDate instanceof Date &&
    !isNaN(maturityDate.getTime()) &&
    maturityDate > fiveYearsFromNow;
  const adjustedRiskWeight = maturityIsOver5Years ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: capital requirement
  const capitalRequirement = loanAmount * adjustedRiskWeight * 0.08;

  // Step 4: expected loss (LGD = 45%)
  const expectedLoss = loanAmount * probabilityOfDefault * 0.45;

  // Step 5: risk band
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
  const iterations = 1000;
  const losses: number[] = new Array(iterations);
  let defaults = 0;

  for (let i = 0; i < iterations; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses[i] = loanAmount * (1 - recoveryRate);
    } else {
      losses[i] = 0;
    }
  }

  const simulatedDefaultRate = defaults / iterations;
  const expectedPortfolioLoss = losses.reduce((sum, l) => sum + l, 0) / iterations;

  const sortedLosses = [...losses].sort((a, b) => a - b);
  const var95Index = Math.floor(iterations * 0.95);
  const worstCaseLoss = sortedLosses[var95Index];

  const tailCount = Math.floor(iterations * 0.05);
  const tailLosses = sortedLosses.slice(iterations - tailCount);
  const tailRiskLoss = tailCount > 0 ? tailLosses.reduce((sum, l) => sum + l, 0) / tailCount : 0;

  // Step 8: risk narrative
  const simRatePct = (simulatedDefaultRate * 100).toFixed(2);
  const riskNarrative =
    `${creditRating} loan ($${loanAmount}): ${riskBand}. ` +
    `Simulated default rate: ${simRatePct}%. ` +
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
