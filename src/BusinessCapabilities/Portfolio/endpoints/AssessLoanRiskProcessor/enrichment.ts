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

// Step 1: PD map — values as decimals (0.01% = 0.0001)
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function enrich(input: AssessLoanRiskProcessorEnrichmentInput): Promise<AssessLoanRiskProcessorEnrichmentOutput> {
  const { creditRating, loanAmount, maturityDate } = input;

  // Step 1: Map credit rating to probability of default
  const probabilityOfDefault = PD_MAP[creditRating] ?? 0;

  // Step 2: Calculate risk weight with optional maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[creditRating] ?? 1.0;
  // Number(Date) returns timestamp ms; Number(non-date) returns NaN — NaN > 5 is false (no adjustment)
  const maturityMs = Number(maturityDate) - Date.now();
  const maturityYears = maturityMs / (1000 * 60 * 60 * 24 * 365.25);
  const adjustedRiskWeight = maturityYears > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = round2(loanAmount * adjustedRiskWeight * 0.08);

  // Step 4: Expected loss = loanAmount × PD × 0.45 (LGD 45%)
  const expectedLoss = round2(loanAmount * probabilityOfDefault * 0.45);

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

  // Step 6: Monte Carlo simulation — 1000 iterations
  const recoveryRate = RECOVERY_RATE_MAP[creditRating] ?? 0.40;
  const lossPerDefault = loanAmount * (1 - recoveryRate);
  const losses: number[] = new Array(1000);
  let defaultCount = 0;

  for (let i = 0; i < 1000; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaultCount++;
      losses[i] = lossPerDefault;
    } else {
      losses[i] = 0;
    }
  }

  // Step 7: Simulation results
  const simulatedDefaultRate = round2(defaultCount / 1000);
  const expectedPortfolioLoss = round2(losses.reduce((sum, l) => sum + l, 0) / 1000);

  losses.sort((a, b) => a - b);
  const varIdx = Math.floor(0.95 * 1000); // 95th percentile index (950)
  const worstCaseLoss = round2(losses[varIdx] ?? 0);

  const tailSlice = losses.slice(varIdx); // worst 5% (indices 950–999)
  const tailRiskLoss = round2(tailSlice.reduce((sum, l) => sum + l, 0) / (tailSlice.length || 1));

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
