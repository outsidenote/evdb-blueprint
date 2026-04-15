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

// Step 1: Probability of default by credit rating (as decimal fractions)
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

// Step 6: Recovery rates by rating
const RECOVERY_RATE_MAP: Record<string, number> = {
  AAA: 0.70,
  AA:  0.70,
  A:   0.70,
  BBB: 0.55,
  BB:  0.40,
  B:   0.30,
  CCC: 0.20,
};

export async function enrich(input: AssessLoanRiskProcessorEnrichmentInput): Promise<AssessLoanRiskProcessorEnrichmentOutput> {
  const rating = input.creditRating;

  // Step 1: Look up probability of default (default to BBB if unknown)
  const probabilityOfDefault = PD_MAP[rating] ?? PD_MAP["BBB"];

  // Step 2: Basel III risk weight with maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[rating] ?? RISK_WEIGHT_MAP["BBB"];
  const now = new Date();
  const maturityMs = (input.maturityDate instanceof Date ? input.maturityDate : new Date(input.maturityDate as any)).getTime();
  const maturityYears = (maturityMs - now.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  const adjustedRiskWeight = maturityYears > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = Math.round(input.loanAmount * adjustedRiskWeight * 0.08 * 100) / 100;

  // Step 4: Expected loss = loanAmount × PD × LGD (45%)
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

  // Step 6: Monte Carlo simulation (1000 iterations)
  const recoveryRate = RECOVERY_RATE_MAP[rating] ?? RECOVERY_RATE_MAP["BBB"];
  const ITERATIONS = 1000;
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

  // Step 7: Simulation results
  const simulatedDefaultRate = Math.round((defaults / ITERATIONS) * 1000000) / 1000000; // approximate PD as decimal

  const totalLoss = losses.reduce((sum, l) => sum + l, 0);
  const expectedPortfolioLoss = Math.round((totalLoss / ITERATIONS) * 100) / 100;

  // Sort ascending for percentile calculations
  const sortedLosses = [...losses].sort((a, b) => a - b);

  // VaR at 95%: value at the 95th percentile index
  const var95Index = Math.floor(ITERATIONS * 0.95);
  const worstCaseLoss = Math.round(sortedLosses[var95Index] * 100) / 100;

  // CVaR / Expected Shortfall: average of worst 5% scenarios
  const tailLosses = sortedLosses.slice(var95Index);
  const tailRiskLoss = tailLosses.length > 0
    ? Math.round((tailLosses.reduce((sum, l) => sum + l, 0) / tailLosses.length) * 100) / 100
    : 0;

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
