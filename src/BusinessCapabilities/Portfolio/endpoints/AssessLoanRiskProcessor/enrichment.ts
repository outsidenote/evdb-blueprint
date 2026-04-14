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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const ITERATIONS = 1000;
const VAR_INDEX = Math.floor(0.95 * ITERATIONS); // 950

export async function enrich(input: AssessLoanRiskProcessorEnrichmentInput): Promise<AssessLoanRiskProcessorEnrichmentOutput> {
  const probabilityOfDefault = PD_MAP[input.creditRating] ?? 0;
  const baseRiskWeight = RISK_WEIGHT_MAP[input.creditRating] ?? 0;
  const recoveryRate = RECOVERY_RATE_MAP[input.creditRating] ?? 0.45;

  // Step 2: maturity adjustment — if maturity > 5 years multiply risk weight by 1.15
  const now = new Date();
  const maturityDate = input.maturityDate instanceof Date
    ? input.maturityDate
    : new Date(input.maturityDate as unknown as string);
  const yearsToMaturity = isNaN(maturityDate.getTime())
    ? 0
    : (maturityDate.getTime() - now.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const adjustedRiskWeight = round2(yearsToMaturity > 5 ? baseRiskWeight * 1.15 : baseRiskWeight);

  // Step 3
  const capitalRequirement = round2(input.loanAmount * adjustedRiskWeight * 0.08);

  // Step 4 (LGD = 45%)
  const expectedLoss = round2(input.loanAmount * probabilityOfDefault * 0.45);

  // Step 5: risk band from adjusted risk weight
  let riskBand: string;
  if (adjustedRiskWeight <= 0.30) riskBand = "Investment Grade - Low";
  else if (adjustedRiskWeight <= 0.55) riskBand = "Investment Grade - Medium";
  else if (adjustedRiskWeight <= 1.00) riskBand = "Speculative - High";
  else riskBand = "Speculative - Critical";

  // Step 6: Monte Carlo simulation (1000 iterations)
  const losses: number[] = new Array(ITERATIONS);
  let defaults = 0;
  let totalLoss = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      const loss = input.loanAmount * (1 - recoveryRate);
      losses[i] = loss;
      totalLoss += loss;
    } else {
      losses[i] = 0;
    }
  }

  // Step 7: simulation results
  const simulatedDefaultRate = round2(defaults / ITERATIONS);
  const expectedPortfolioLoss = round2(totalLoss / ITERATIONS);

  losses.sort((a, b) => a - b);
  const worstCaseLoss = round2(losses[VAR_INDEX]); // VaR at 95%
  const tailSlice = losses.slice(VAR_INDEX);        // worst 5% scenarios
  const tailRiskLoss = round2(tailSlice.reduce((sum, l) => sum + l, 0) / tailSlice.length); // CVaR

  // Step 8: risk narrative
  const riskNarrative =
    `${input.creditRating} loan ($${input.loanAmount}): ${riskBand}. ` +
    `Simulated default rate: ${(simulatedDefaultRate * 100).toFixed(2)}%. ` +
    `Expected loss: $${expectedPortfolioLoss}. ` +
    `VaR(95%): $${worstCaseLoss}. ` +
    `Tail risk: $${tailRiskLoss}`;

  return {
    ...input,
    acquisitionDate: now,
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
