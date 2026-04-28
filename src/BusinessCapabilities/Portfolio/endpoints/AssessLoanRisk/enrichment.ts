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

// Step 1: PD by credit rating (Basel III)
const PD_MAP: Record<string, number> = {
  AAA: 0.0001, // 0.01%
  AA: 0.0002,  // 0.02%
  A: 0.0005,   // 0.05%
  BBB: 0.002,  // 0.20%
  BB: 0.010,   // 1.00%
  B: 0.030,    // 3.00%
  CCC: 0.100,  // 10.00%
};

// Step 2: Risk weight by credit rating (Basel III standardized approach)
const RISK_WEIGHT_MAP: Record<string, number> = {
  AAA: 0.20,
  AA: 0.25,
  A: 0.35,
  BBB: 0.50,
  BB: 0.75,
  B: 1.00,
  CCC: 1.50,
};

// Step 6: Recovery rate by credit rating for Monte Carlo loss calculation
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

  // Step 2: Basel III risk weight with maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[creditRating] ?? 0;
  let maturityYears = 0;
  try {
    const maturityMs = maturityDate.getTime();
    if (!isNaN(maturityMs)) {
      maturityYears = (maturityMs - Date.now()) / (365.25 * 24 * 60 * 60 * 1000);
    }
  } catch {
    // maturityDate is not a valid Date; treat as no maturity adjustment
  }
  const adjustedRiskWeight = maturityYears > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = loanAmount * adjustedRiskWeight * 0.08;

  // Step 4: Expected loss = loanAmount × PD × LGD (LGD = 45%)
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

  // Steps 6–7: Monte Carlo simulation (1000 iterations) for default probability
  const recoveryRate = RECOVERY_RATE_MAP[creditRating] ?? 0.45;
  const ITERATIONS = 1000;
  const losses: number[] = [];
  let defaults = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses.push(loanAmount * (1 - recoveryRate));
    } else {
      losses.push(0);
    }
  }

  // simulatedDefaultRate = defaults / 1000 (approximates PD)
  const simulatedDefaultRate = defaults / ITERATIONS;
  // expectedPortfolioLoss = average loss across all iterations
  const expectedPortfolioLoss = losses.reduce((sum, l) => sum + l, 0) / ITERATIONS;

  // Sort ascending for percentile calculations
  losses.sort((a, b) => a - b);
  // worstCaseLoss = VaR at 95% confidence (95th percentile)
  const var95Index = Math.ceil(0.95 * ITERATIONS); // 950
  const worstCaseLoss = losses[var95Index] ?? 0;
  // tailRiskLoss = CVaR / Expected Shortfall = average of worst 5% scenarios
  const tailLosses = losses.slice(var95Index);
  const tailRiskLoss =
    tailLosses.length > 0
      ? tailLosses.reduce((sum, l) => sum + l, 0) / tailLosses.length
      : 0;

  // Step 8: Risk narrative
  const simulatedDefaultRatePct = (simulatedDefaultRate * 100).toFixed(2);
  const riskNarrative =
    `${creditRating} loan ($${loanAmount}): ${riskBand}. ` +
    `Simulated default rate: ${simulatedDefaultRatePct}%. ` +
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
