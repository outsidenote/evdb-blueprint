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

// Step 1: Credit rating → Probability of Default (as decimal)
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

// Step 6: Recovery rates by rating group
const RECOVERY_RATE_MAP: Record<string, number> = {
  AAA: 0.70,
  AA:  0.70,
  A:   0.70,
  BBB: 0.55,
  BB:  0.40,
  B:   0.30,
  CCC: 0.20,
};

export async function enrich(input: AssessLoanRiskEnrichmentInput): Promise<AssessLoanRiskEnrichmentOutput> {
  const acquisitionDate = new Date();

  // Step 1: Map credit rating to probability of default
  const probabilityOfDefault = PD_MAP[input.creditRating] ?? 0;

  // Step 2: Calculate risk weight with Basel III; adjust for maturity > 5 years
  const baseRiskWeight = RISK_WEIGHT_MAP[input.creditRating] ?? 1.00;
  const maturityYears = (input.maturityDate.getTime() - acquisitionDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  const adjustedRiskWeight = maturityYears > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = Math.round(input.loanAmount * adjustedRiskWeight * 0.08 * 100) / 100;

  // Step 4: Expected loss = loanAmount × PD × 0.45 (LGD = 45%)
  const expectedLoss = input.loanAmount * probabilityOfDefault * 0.45;

  // Step 5: Derive risk band from adjusted risk weight
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
  const recoveryRate = RECOVERY_RATE_MAP[input.creditRating] ?? 0.55;
  const lossIfDefault = input.loanAmount * (1 - recoveryRate);
  const losses: number[] = [];
  let defaults = 0;
  let totalLosses = 0;

  for (let i = 0; i < 1000; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses.push(lossIfDefault);
      totalLosses += lossIfDefault;
    } else {
      losses.push(0);
    }
  }

  // Step 7: Compute simulation results
  const simulatedDefaultRate = defaults / 1000;
  const expectedPortfolioLoss = totalLosses / 1000;

  // VaR at 95% confidence: 95th percentile loss
  const sortedLosses = [...losses].sort((a, b) => a - b);
  const varIndex = Math.floor(1000 * 0.95); // = 950
  const worstCaseLoss = sortedLosses[varIndex];

  // CVaR / Expected Shortfall: average of worst 5% scenarios
  const tailLosses = sortedLosses.slice(varIndex);
  const tailRiskLoss = tailLosses.reduce((sum, l) => sum + l, 0) / tailLosses.length;

  // Step 8: Build risk narrative
  const riskNarrative = `${input.creditRating} loan ($${input.loanAmount}): ${riskBand}. Simulated default rate: ${simulatedDefaultRate}%. Expected loss: $${expectedPortfolioLoss}. VaR(95%): $${worstCaseLoss}. Tail risk: $${tailRiskLoss}`;

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
