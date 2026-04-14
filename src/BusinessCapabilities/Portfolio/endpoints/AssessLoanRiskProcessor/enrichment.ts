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

export async function enrich(input: AssessLoanRiskProcessorEnrichmentInput): Promise<AssessLoanRiskProcessorEnrichmentOutput> {
  const { creditRating, loanAmount, maturityDate } = input;

  // Step 1: Map credit rating to probability of default
  const probabilityOfDefault = PD_MAP[creditRating] ?? 0;

  // Step 2: Basel III risk weight with maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[creditRating] ?? 0;
  const now = new Date();
  const maturityYears = (maturityDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  const adjustedRiskWeight = maturityYears > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

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

  // Steps 6 & 7: Monte Carlo simulation (1000 iterations)
  const recoveryRate = RECOVERY_RATE_MAP[creditRating] ?? 0;
  const losses: number[] = [];
  let defaultCount = 0;

  for (let i = 0; i < 1000; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaultCount++;
      losses.push(loanAmount * (1 - recoveryRate));
    } else {
      losses.push(0);
    }
  }

  const simulatedDefaultRate = defaultCount / 1000;
  const totalLoss = losses.reduce((sum, l) => sum + l, 0);
  const expectedPortfolioLoss = Math.round((totalLoss / 1000) * 100) / 100;

  // Sort ascending for percentile calculations
  losses.sort((a, b) => a - b);

  // VaR at 95% confidence (95th percentile)
  const varIndex = Math.floor(0.95 * 1000); // index 950
  const worstCaseLoss = Math.round(losses[varIndex] * 100) / 100;

  // CVaR: average of worst 5% (indices 950–999)
  const tailLosses = losses.slice(varIndex);
  const tailSum = tailLosses.reduce((sum, l) => sum + l, 0);
  const tailRiskLoss = Math.round((tailSum / tailLosses.length) * 100) / 100;

  // Step 8: Risk narrative
  const simulatedDefaultRatePct = (simulatedDefaultRate * 100).toFixed(2);
  const riskNarrative = `${creditRating} loan ($${loanAmount}): ${riskBand}. Simulated default rate: ${simulatedDefaultRatePct}%. Expected loss: $${expectedPortfolioLoss}. VaR(95%): $${worstCaseLoss}. Tail risk: $${tailRiskLoss}`;

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
