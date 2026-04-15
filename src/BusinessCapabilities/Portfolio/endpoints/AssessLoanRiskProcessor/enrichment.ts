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

// Step 1: PD map — percentage expressed as decimal (e.g. 0.01% → 0.0001)
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function deriveRiskBand(adjustedRiskWeight: number): string {
  if (adjustedRiskWeight <= 0.30) return "Investment Grade - Low";
  if (adjustedRiskWeight <= 0.55) return "Investment Grade - Medium";
  if (adjustedRiskWeight <= 1.00) return "Speculative - High";
  return "Speculative - Critical";
}

export async function enrich(input: AssessLoanRiskProcessorEnrichmentInput): Promise<AssessLoanRiskProcessorEnrichmentOutput> {
  const { creditRating, loanAmount, maturityDate } = input;

  // Step 1: Map credit rating to probability of default
  const probabilityOfDefault = PD_MAP[creditRating] ?? 0;

  // Step 2: Calculate risk weight with maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[creditRating] ?? 1.00;
  const maturityMs = maturityDate instanceof Date
    ? maturityDate.getTime()
    : new Date(String(maturityDate)).getTime();
  const yearsToMaturity = (maturityMs - Date.now()) / (1000 * 60 * 60 * 24 * 365.25);
  const adjustedRiskWeight = yearsToMaturity > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = round2(loanAmount * adjustedRiskWeight * 0.08);

  // Step 4: Expected loss = loanAmount × PD × 0.45 (LGD assumption)
  const expectedLoss = round2(loanAmount * probabilityOfDefault * 0.45);

  // Step 5: Risk band derived from adjusted risk weight
  const riskBand = deriveRiskBand(adjustedRiskWeight);

  // Steps 6 & 7: Monte Carlo simulation — 1000 iterations
  const recoveryRate = RECOVERY_RATE_MAP[creditRating] ?? 0.50;
  const lossIfDefault = loanAmount * (1 - recoveryRate);
  const iterations = 1000;
  const allLosses: number[] = [];
  let totalDefaults = 0;

  for (let i = 0; i < iterations; i++) {
    const random = Math.random();
    if (random < probabilityOfDefault) {
      totalDefaults++;
      allLosses.push(lossIfDefault);
    } else {
      allLosses.push(0);
    }
  }

  // Sort ascending for percentile calculations
  allLosses.sort((a, b) => a - b);

  const simulatedDefaultRate = Math.round((totalDefaults / iterations) * 10000) / 10000;

  const totalLoss = allLosses.reduce((sum, l) => sum + l, 0);
  const expectedPortfolioLoss = round2(totalLoss / iterations);

  // VaR at 95% confidence — 95th percentile (index 950 of 1000)
  const var95Index = Math.floor(iterations * 0.95);
  const worstCaseLoss = round2(allLosses[var95Index]);

  // CVaR / Expected Shortfall — average of worst 5% scenarios (indices 950–999)
  const tailScenarios = allLosses.slice(var95Index);
  const tailTotal = tailScenarios.reduce((sum, l) => sum + l, 0);
  const tailRiskLoss = round2(tailTotal / tailScenarios.length);

  // Step 8: Risk narrative
  const riskNarrative =
    `${creditRating} loan ($${loanAmount}): ${riskBand}. ` +
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
