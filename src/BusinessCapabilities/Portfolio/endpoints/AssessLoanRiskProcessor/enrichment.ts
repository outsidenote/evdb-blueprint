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

// Step 1: PD lookup (as fractions, e.g. 0.01 = 1%)
const PD_MAP: Record<string, number> = {
  AAA: 0.0001,
  AA: 0.0002,
  A: 0.0005,
  BBB: 0.002,
  BB: 0.01,
  B: 0.03,
  CCC: 0.10,
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

export async function enrich(input: AssessLoanRiskProcessorEnrichmentInput): Promise<AssessLoanRiskProcessorEnrichmentOutput> {
  const rating = input.creditRating;

  // Step 1: Map credit rating to probability of default
  const probabilityOfDefault = PD_MAP[rating] ?? PD_MAP.BBB;

  // Step 2: Calculate risk weight with maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[rating] ?? RISK_WEIGHT_MAP.BBB;
  let maturityAdjustment = 1.0;
  try {
    const maturityDate = input.maturityDate instanceof Date
      ? input.maturityDate
      : new Date(input.maturityDate as unknown as string);
    const yearsToMaturity = (maturityDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 365.25);
    if (!isNaN(yearsToMaturity) && yearsToMaturity > 5) {
      maturityAdjustment = 1.15;
    }
  } catch {
    // invalid date — no maturity adjustment
  }
  const adjustedRiskWeight = baseRiskWeight * maturityAdjustment;

  // Step 3: Capital requirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = Math.round(input.loanAmount * adjustedRiskWeight * 0.08 * 100) / 100;

  // Step 4: Expected loss = loanAmount × PD × LGD (0.45)
  const expectedLoss = Math.round(input.loanAmount * probabilityOfDefault * 0.45 * 100) / 100;

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

  // Step 6 & 7: Monte Carlo simulation (1000 iterations)
  const ITERATIONS = 1000;
  const recoveryRate = RECOVERY_RATE_MAP[rating] ?? RECOVERY_RATE_MAP.BBB;
  const losses: number[] = new Array(ITERATIONS);
  let defaults = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses[i] = input.loanAmount * (1 - recoveryRate);
    } else {
      losses[i] = 0;
    }
  }

  // simulatedDefaultRate as percentage (approximates PD × 100)
  const simulatedDefaultRate = Math.round((defaults / ITERATIONS) * 100 * 100) / 100;

  const totalLoss = losses.reduce((a, b) => a + b, 0);
  const expectedPortfolioLoss = Math.round((totalLoss / ITERATIONS) * 100) / 100;

  // Sort ascending to find percentiles
  const sortedLosses = [...losses].sort((a, b) => a - b);

  // VaR at 95% confidence: loss exceeded by only 5% of scenarios
  const varIndex = Math.floor(ITERATIONS * 0.95);
  const worstCaseLoss = Math.round(sortedLosses[varIndex] * 100) / 100;

  // CVaR / Expected Shortfall: average of worst 5% scenarios
  const tailLosses = sortedLosses.slice(varIndex);
  const tailRiskLoss = Math.round(
    (tailLosses.reduce((a, b) => a + b, 0) / tailLosses.length) * 100,
  ) / 100;

  // Step 8: Risk narrative
  const riskNarrative =
    `${rating} loan ($${input.loanAmount}): ${riskBand}. ` +
    `Simulated default rate: ${simulatedDefaultRate}%. ` +
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
