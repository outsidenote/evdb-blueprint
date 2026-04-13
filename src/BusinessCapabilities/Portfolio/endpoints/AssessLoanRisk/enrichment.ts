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

const PD_MAP: Record<string, number> = {
  AAA: 0.0001, AA: 0.0002, A: 0.0005, BBB: 0.002, BB: 0.01, B: 0.03, CCC: 0.10,
};

const RISK_WEIGHT_MAP: Record<string, number> = {
  AAA: 0.20, AA: 0.25, A: 0.35, BBB: 0.50, BB: 0.75, B: 1.00, CCC: 1.50,
};

const RECOVERY_RATE_MAP: Record<string, number> = {
  AAA: 0.70, AA: 0.70, A: 0.70, BBB: 0.55, BB: 0.40, B: 0.30, CCC: 0.20,
};

export async function enrich(input: AssessLoanRiskEnrichmentInput): Promise<AssessLoanRiskEnrichmentOutput> {
  const acquisitionDate = new Date();

  // Step 1: Probability of default
  const probabilityOfDefault = PD_MAP[input.creditRating] ?? 0;

  // Step 2: Risk weight with maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[input.creditRating] ?? 1.00;
  const yearsToMaturity = (input.maturityDate.getTime() - acquisitionDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const adjustedRiskWeight = yearsToMaturity > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement (Basel III)
  const capitalRequirement = input.loanAmount * adjustedRiskWeight * 0.08;

  // Step 4: Expected loss (LGD = 45%)
  const expectedLoss = input.loanAmount * probabilityOfDefault * 0.45;

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
  const recoveryRate = RECOVERY_RATE_MAP[input.creditRating] ?? 0.50;
  const iterations = 1000;
  let defaults = 0;
  const losses: number[] = new Array(iterations);

  for (let i = 0; i < iterations; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses[i] = input.loanAmount * (1 - recoveryRate);
    } else {
      losses[i] = 0;
    }
  }

  // Step 7: Simulation results
  const simulatedDefaultRate = defaults / iterations;
  const totalLoss = losses.reduce((sum, l) => sum + l, 0);
  const expectedPortfolioLoss = totalLoss / iterations;

  losses.sort((a, b) => a - b);
  const varIndex = Math.floor(iterations * 0.95);
  const worstCaseLoss = losses[varIndex] ?? 0;
  const tailLosses = losses.slice(varIndex);
  const tailRiskLoss = tailLosses.reduce((sum, l) => sum + l, 0) / (tailLosses.length || 1);

  // Step 8: Risk narrative
  const fmtPct = (n: number) => (n * 100).toFixed(4);
  const fmtMoney = (n: number) => n.toFixed(2);
  const riskNarrative = `${input.creditRating} loan ($${input.loanAmount}): ${riskBand}. Simulated default rate: ${fmtPct(simulatedDefaultRate)}%. Expected loss: $${fmtMoney(expectedPortfolioLoss)}. VaR(95%): $${fmtMoney(worstCaseLoss)}. Tail risk: $${fmtMoney(tailRiskLoss)}`;

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
