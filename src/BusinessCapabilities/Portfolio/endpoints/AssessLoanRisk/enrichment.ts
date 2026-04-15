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

// Step 1: Credit rating → probability of default (fraction, not percentage)
const PD_MAP: Record<string, number> = {
  AAA: 0.0001,  // 0.01%
  AA:  0.0002,  // 0.02%
  A:   0.0005,  // 0.05%
  BBB: 0.0020,  // 0.20%
  BB:  0.0100,  // 1.00%
  B:   0.0300,  // 3.00%
  CCC: 0.1000,  // 10.00%
};

// Step 2: Basel III standardized risk weights
const RISK_WEIGHT_MAP: Record<string, number> = {
  AAA: 0.20,
  AA:  0.25,
  A:   0.35,
  BBB: 0.50,
  BB:  0.75,
  B:   1.00,
  CCC: 1.50,
};

// Step 6: Recovery rates by rating group
const RECOVERY_RATE_MAP: Record<string, number> = {
  AAA: 0.70,
  AA:  0.70,
  A:   0.70,
  BBB: 0.55,
  BB:  0.40,
  B:   0.30,
  CCC: 0.20,
};

export async function enrich(input: AssessLoanRiskEnrichmentInput): Promise<AssessLoanRiskEnrichmentOutput> {
  const acquisitionDate = new Date();

  const { creditRating, loanAmount, maturityDate } = input;

  // Step 1: PD lookup
  const probabilityOfDefault = PD_MAP[creditRating] ?? 0;

  // Step 2: Risk weight with Basel III maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[creditRating] ?? 0;
  const yearsToMaturity =
    maturityDate instanceof Date && !isNaN(maturityDate.getTime())
      ? (maturityDate.getTime() - acquisitionDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
      : 0;
  const adjustedRiskWeight = yearsToMaturity > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = loanAmount * adjustedRiskWeight * 0.08;

  // Step 4: Expected loss = loanAmount × PD × LGD (LGD = 0.45)
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

  // Step 6 & 7: Monte Carlo simulation — 1000 iterations
  const recoveryRate = RECOVERY_RATE_MAP[creditRating] ?? 0;
  const ITERATIONS = 1000;
  const losses: number[] = new Array(ITERATIONS);
  let defaults = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses[i] = loanAmount * (1 - recoveryRate);
    } else {
      losses[i] = 0;
    }
  }

  // simulatedDefaultRate ≈ PD (fraction)
  const simulatedDefaultRate = defaults / ITERATIONS;

  // expectedPortfolioLoss = average loss across all iterations
  const totalLoss = losses.reduce((sum, l) => sum + l, 0);
  const expectedPortfolioLoss = totalLoss / ITERATIONS;

  // worstCaseLoss = 95th percentile VaR
  const sortedLosses = losses.slice().sort((a, b) => a - b);
  const var95Index = Math.floor(ITERATIONS * 0.95);
  const worstCaseLoss = sortedLosses[var95Index];

  // tailRiskLoss = CVaR — average of worst 5% scenarios
  const tail = sortedLosses.slice(var95Index);
  const tailRiskLoss =
    tail.length > 0 ? tail.reduce((sum, l) => sum + l, 0) / tail.length : 0;

  // Step 8: Risk narrative
  const simRatePct = (simulatedDefaultRate * 100).toFixed(2);
  const riskNarrative =
    `${creditRating} loan ($${loanAmount}): ${riskBand}. ` +
    `Simulated default rate: ${simRatePct}%. ` +
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
