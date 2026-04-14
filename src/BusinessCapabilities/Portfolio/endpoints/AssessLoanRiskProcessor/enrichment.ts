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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function enrich(input: AssessLoanRiskProcessorEnrichmentInput): Promise<AssessLoanRiskProcessorEnrichmentOutput> {
  const acquisitionDate = new Date();

  // Step 1: Map credit rating to probability of default
  const probabilityOfDefault = PD_MAP[input.creditRating] ?? 0;

  // Step 2: Basel III risk weight with maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[input.creditRating] ?? 0;
  const maturityMs = new Date(input.maturityDate).getTime();
  const fiveYearsMs = 5 * 365.25 * 24 * 60 * 60 * 1000;
  const isLongMaturity = !isNaN(maturityMs) && (maturityMs - acquisitionDate.getTime()) > fiveYearsMs;
  const adjustedRiskWeight = isLongMaturity ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement
  const capitalRequirement = round2(input.loanAmount * adjustedRiskWeight * 0.08);

  // Step 4: Expected loss (LGD = 45%)
  const expectedLoss = round2(input.loanAmount * probabilityOfDefault * 0.45);

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

  // Steps 6 & 7: Monte Carlo simulation (1000 iterations)
  const recoveryRate = RECOVERY_RATE_MAP[input.creditRating] ?? 0.55;
  const iterations = 1000;
  const losses: number[] = new Array(iterations);
  let defaults = 0;

  for (let i = 0; i < iterations; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses[i] = input.loanAmount * (1 - recoveryRate);
    } else {
      losses[i] = 0;
    }
  }

  const simulatedDefaultRate = Math.round((defaults / iterations) * 10000) / 10000;

  const totalLoss = losses.reduce((sum, l) => sum + l, 0);
  const expectedPortfolioLoss = round2(totalLoss / iterations);

  const sortedLosses = [...losses].sort((a, b) => a - b);

  // VaR at 95% confidence (95th percentile)
  const var95Index = Math.floor(iterations * 0.95);
  const worstCaseLoss = round2(sortedLosses[var95Index]);

  // CVaR / Expected Shortfall: average of worst 5% scenarios
  const tailCount = Math.floor(iterations * 0.05);
  const tailLosses = sortedLosses.slice(iterations - tailCount);
  const tailRiskLoss = tailCount > 0
    ? round2(tailLosses.reduce((sum, l) => sum + l, 0) / tailCount)
    : 0;

  // Step 8: Risk narrative
  const simulatedDefaultRatePct = (simulatedDefaultRate * 100).toFixed(2);
  const riskNarrative = `${input.creditRating} loan ($${input.loanAmount}): ${riskBand}. Simulated default rate: ${simulatedDefaultRatePct}%. Expected loss: $${expectedPortfolioLoss}. VaR(95%): $${worstCaseLoss}. Tail risk: $${tailRiskLoss}`;

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
