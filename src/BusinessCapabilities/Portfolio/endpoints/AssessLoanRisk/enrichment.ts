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

// Step 1: Probability of default by credit rating
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

export async function enrich(input: AssessLoanRiskEnrichmentInput): Promise<AssessLoanRiskEnrichmentOutput> {
  const { creditRating, loanAmount, maturityDate } = input;

  // Step 1: Map credit rating to probability of default
  const probabilityOfDefault = PD_MAP[creditRating] ?? 0;

  // Step 2: Calculate risk weight with maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[creditRating] ?? 0;
  const maturityYears = (maturityDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 365.25);
  const adjustedRiskWeight = maturityYears > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement (Basel III standardized)
  const capitalRequirement = loanAmount * adjustedRiskWeight * 0.08;

  // Step 4: Expected loss (LGD assumption 45%)
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

  // Step 6: Monte Carlo simulation (1000 iterations)
  const recoveryRate = RECOVERY_RATE_MAP[creditRating] ?? 0.45;
  const losses: number[] = [];
  let defaults = 0;
  for (let i = 0; i < 1000; i++) {
    const random = Math.random();
    if (random < probabilityOfDefault) {
      defaults++;
      losses.push(loanAmount * (1 - recoveryRate));
    } else {
      losses.push(0);
    }
  }

  // Step 7: Compute simulation results
  const simulatedDefaultRate = defaults / 1000;
  const expectedPortfolioLoss = losses.reduce((sum, l) => sum + l, 0) / 1000;
  const sorted = [...losses].sort((a, b) => a - b);
  const var95Index = Math.floor(1000 * 0.95);
  const worstCaseLoss = sorted[var95Index];
  const tailLosses = sorted.slice(var95Index);
  const tailRiskLoss = tailLosses.length > 0
    ? tailLosses.reduce((sum, l) => sum + l, 0) / tailLosses.length
    : 0;

  // Step 8: Risk narrative
  const riskNarrative = `${creditRating} loan ($${loanAmount}): ${riskBand}. Simulated default rate: ${(simulatedDefaultRate * 100).toFixed(2)}%. Expected loss: $${expectedPortfolioLoss.toFixed(2)}. VaR(95%): $${worstCaseLoss.toFixed(2)}. Tail risk: $${tailRiskLoss.toFixed(2)}`;

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
