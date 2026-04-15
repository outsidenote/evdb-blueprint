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

// Step 1: Credit rating → probability of default (decimal fraction)
const PD_MAP: Record<string, number> = {
  AAA: 0.0001,  // 0.01%
  AA:  0.0002,  // 0.02%
  A:   0.0005,  // 0.05%
  BBB: 0.002,   // 0.20%
  BB:  0.01,    // 1.00%
  B:   0.03,    // 3.00%
  CCC: 0.10,    // 10.00%
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

// Step 6: Recovery rates by rating bucket
const RECOVERY_RATE_MAP: Record<string, number> = {
  AAA: 0.70,
  AA:  0.70,
  A:   0.70,
  BBB: 0.55,
  BB:  0.40,
  B:   0.30,
  CCC: 0.20,
};

// Step 5: Derive risk band from adjusted risk weight
function getRiskBand(adjustedRiskWeight: number): string {
  if (adjustedRiskWeight <= 0.30) return "Investment Grade - Low";
  if (adjustedRiskWeight <= 0.55) return "Investment Grade - Medium";
  if (adjustedRiskWeight <= 1.00) return "Speculative - High";
  return "Speculative - Critical";
}

export async function enrich(input: AssessLoanRiskEnrichmentInput): Promise<AssessLoanRiskEnrichmentOutput> {
  const acquisitionDate = new Date();
  const { creditRating, loanAmount, maturityDate } = input;

  // Step 1: Probability of default
  const probabilityOfDefault = PD_MAP[creditRating] ?? 0;

  // Step 2: Risk weight with Basel III maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[creditRating] ?? 1.50;
  const yearsToMaturity = (maturityDate.getTime() - acquisitionDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  const adjustedRiskWeight = yearsToMaturity > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement (Basel III minimum 8% capital ratio)
  const capitalRequirement = loanAmount * adjustedRiskWeight * 0.08;

  // Step 4: Expected loss using 45% LGD assumption
  const expectedLoss = loanAmount * probabilityOfDefault * 0.45;

  // Step 5: Risk band
  const riskBand = getRiskBand(adjustedRiskWeight);

  // Steps 6-7: Monte Carlo simulation (1000 iterations)
  const ITERATIONS = 1000;
  const recoveryRate = RECOVERY_RATE_MAP[creditRating] ?? 0.20;
  const lossIfDefault = loanAmount * (1 - recoveryRate);

  let defaults = 0;
  const losses: number[] = new Array(ITERATIONS);

  for (let i = 0; i < ITERATIONS; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses[i] = lossIfDefault;
    } else {
      losses[i] = 0;
    }
  }

  losses.sort((a, b) => a - b);

  const simulatedDefaultRate = defaults / ITERATIONS;
  const totalLoss = losses.reduce((sum, l) => sum + l, 0);
  const expectedPortfolioLoss = totalLoss / ITERATIONS;

  // VaR at 95% confidence: 950th value in sorted ascending array (0-indexed)
  const var95Index = Math.floor(ITERATIONS * 0.95);
  const worstCaseLoss = losses[var95Index];

  // CVaR / Expected Shortfall: average of the worst 5% (top 50 scenarios)
  const tailLosses = losses.slice(var95Index);
  const tailRiskLoss = tailLosses.reduce((sum, l) => sum + l, 0) / tailLosses.length;

  // Step 8: Risk narrative
  const riskNarrative =
    `${creditRating} loan ($${loanAmount}): ${riskBand}. ` +
    `Simulated default rate: ${(simulatedDefaultRate * 100).toFixed(4)}%. ` +
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
