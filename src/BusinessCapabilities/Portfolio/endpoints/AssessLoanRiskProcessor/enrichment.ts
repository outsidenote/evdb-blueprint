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

// Step 1: PD by credit rating
const PD_MAP: Record<string, number> = {
  AAA: 0.0001,
  AA: 0.0002,
  A:   0.0005,
  BBB: 0.0020,
  BB:  0.0100,
  B:   0.0300,
  CCC: 0.1000,
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function enrich(input: AssessLoanRiskProcessorEnrichmentInput): Promise<AssessLoanRiskProcessorEnrichmentOutput> {
  // Step 1: Map credit rating to probability of default
  const probabilityOfDefault = PD_MAP[input.creditRating];
  if (probabilityOfDefault === undefined) {
    throw new Error(`Unknown credit rating: ${input.creditRating}`);
  }

  // Step 2: Basel III risk weight with maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[input.creditRating];
  const yearsToMaturity = (input.maturityDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 365.25);
  const adjustedRiskWeight = yearsToMaturity > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = round2(input.loanAmount * adjustedRiskWeight * 0.08);

  // Step 4: Expected loss = loanAmount × PD × LGD (45%)
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

  // Steps 6 & 7: Monte Carlo simulation — 1000 iterations
  const recoveryRate = RECOVERY_RATE_MAP[input.creditRating];
  const lossPerDefault = input.loanAmount * (1 - recoveryRate);
  const iterations = 1000;
  const losses: number[] = new Array(iterations);
  let defaults = 0;

  for (let i = 0; i < iterations; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses[i] = lossPerDefault;
    } else {
      losses[i] = 0;
    }
  }

  // simulatedDefaultRate approximates the PD
  const simulatedDefaultRate = Math.round((defaults / iterations) * 10000) / 10000;

  // expectedPortfolioLoss = mean loss across all iterations
  const totalLoss = losses.reduce((sum, l) => sum + l, 0);
  const expectedPortfolioLoss = round2(totalLoss / iterations);

  // worstCaseLoss = VaR at 95% confidence (95th percentile)
  const sortedLosses = [...losses].sort((a, b) => a - b);
  const varIndex = Math.floor(0.95 * iterations); // index 950
  const worstCaseLoss = round2(sortedLosses[varIndex]);

  // tailRiskLoss = CVaR — average of worst 5% scenarios (top 50 losses)
  const tailLosses = sortedLosses.slice(varIndex);
  const tailRiskLoss = round2(tailLosses.reduce((sum, l) => sum + l, 0) / tailLosses.length);

  // Step 8: Risk narrative
  const riskNarrative =
    `${input.creditRating} loan ($${input.loanAmount}): ${riskBand}. ` +
    `Simulated default rate: ${(simulatedDefaultRate * 100).toFixed(2)}%. ` +
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
