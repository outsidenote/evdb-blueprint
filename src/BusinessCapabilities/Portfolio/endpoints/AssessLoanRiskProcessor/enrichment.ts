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
  AAA: 0.0001, AA: 0.0002, A: 0.0005,
  BBB: 0.002, BB: 0.01, B: 0.03, CCC: 0.10,
};

const RISK_WEIGHT_MAP: Record<string, number> = {
  AAA: 0.20, AA: 0.25, A: 0.35,
  BBB: 0.50, BB: 0.75, B: 1.00, CCC: 1.50,
};

const RECOVERY_RATE_MAP: Record<string, number> = {
  AAA: 0.70, AA: 0.70, A: 0.70,
  BBB: 0.55, BB: 0.40, B: 0.30, CCC: 0.20,
};

export async function enrich(input: AssessLoanRiskProcessorEnrichmentInput): Promise<AssessLoanRiskProcessorEnrichmentOutput> {
  const acquisitionDate = new Date();

  // Step 1: probability of default by credit rating
  const probabilityOfDefault = PD_MAP[input.creditRating] ?? 0.002;

  // Step 2: Basel III risk weight with maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[input.creditRating] ?? 1.00;
  const maturityYears = (input.maturityDate.getTime() - acquisitionDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const adjustedRiskWeight = maturityYears > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: capital requirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = Math.round(input.loanAmount * adjustedRiskWeight * 0.08 * 100) / 100;

  // Step 4: expected loss = loanAmount × PD × LGD (LGD = 45%)
  const expectedLoss = Math.round(input.loanAmount * probabilityOfDefault * 0.45 * 100) / 100;

  // Step 5: risk band from adjusted risk weight
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
  const recoveryRate = RECOVERY_RATE_MAP[input.creditRating] ?? 0.40;
  const lossPerDefault = input.loanAmount * (1 - recoveryRate);
  const losses: number[] = [];
  let defaults = 0;
  for (let i = 0; i < 1000; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses.push(lossPerDefault);
    } else {
      losses.push(0);
    }
  }

  // Step 7: simulation results
  losses.sort((a, b) => a - b);
  const simulatedDefaultRate = defaults / 1000;
  const expectedPortfolioLoss = Math.round((losses.reduce((sum, l) => sum + l, 0) / 1000) * 100) / 100;

  // VaR at 95% confidence: 95th percentile loss
  const varIndex = Math.floor(1000 * 0.95);
  const worstCaseLoss = Math.round(losses[varIndex] * 100) / 100;

  // CVaR / Expected Shortfall: average of worst 5% scenarios
  const tailLosses = losses.slice(varIndex);
  const tailRiskLoss = Math.round((tailLosses.reduce((sum, l) => sum + l, 0) / tailLosses.length) * 100) / 100;

  // Step 8: risk narrative
  const simDefaultRatePct = Math.round(simulatedDefaultRate * 10000) / 100;
  const riskNarrative = `${input.creditRating} loan ($${input.loanAmount}): ${riskBand}. Simulated default rate: ${simDefaultRatePct}%. Expected loss: $${expectedPortfolioLoss}. VaR(95%): $${worstCaseLoss}. Tail risk: $${tailRiskLoss}`;

  return {
    ...input,
    acquisitionDate,
    probabilityOfDefault,
    capitalRequirement,
    expectedLoss,
    riskBand,
    simulatedDefaultRate,
    expectedPortfolioLoss,
    worstCaseLoss,
    tailRiskLoss,
    riskNarrative,
  };
}
