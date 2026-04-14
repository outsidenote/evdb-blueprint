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
  AAA: 0.0001, AA: 0.0002, A: 0.0005, BBB: 0.0020,
  BB: 0.0100, B: 0.0300, CCC: 0.1000,
};

const RISK_WEIGHT_MAP: Record<string, number> = {
  AAA: 0.20, AA: 0.25, A: 0.35, BBB: 0.50,
  BB: 0.75, B: 1.00, CCC: 1.50,
};

const RECOVERY_RATE_MAP: Record<string, number> = {
  AAA: 0.70, AA: 0.70, A: 0.70,
  BBB: 0.55, BB: 0.40, B: 0.30, CCC: 0.20,
};

export async function enrich(input: AssessLoanRiskEnrichmentInput): Promise<AssessLoanRiskEnrichmentOutput> {
  const acquisitionDate = new Date();

  // Step 1: Probability of default
  const probabilityOfDefault = PD_MAP[input.creditRating] ?? 0;

  // Step 2: Risk weight with maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[input.creditRating] ?? 0;
  const maturityDateObj = input.maturityDate instanceof Date
    ? input.maturityDate
    : new Date(input.maturityDate as unknown as string);
  const yearsToMaturity = (maturityDateObj.getTime() - acquisitionDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const adjustedRiskWeight = (!isNaN(yearsToMaturity) && yearsToMaturity > 5)
    ? baseRiskWeight * 1.15
    : baseRiskWeight;

  // Step 3: Capital requirement
  const capitalRequirement = input.loanAmount * adjustedRiskWeight * 0.08;

  // Step 4: Expected loss (LGD = 45%)
  const expectedLoss = input.loanAmount * probabilityOfDefault * 0.45;

  // Step 5: Risk band
  let riskBand: string;
  if (adjustedRiskWeight <= 0.30) riskBand = "Investment Grade - Low";
  else if (adjustedRiskWeight <= 0.55) riskBand = "Investment Grade - Medium";
  else if (adjustedRiskWeight <= 1.00) riskBand = "Speculative - High";
  else riskBand = "Speculative - Critical";

  // Steps 6–7: Monte Carlo simulation (1000 iterations)
  const recoveryRate = RECOVERY_RATE_MAP[input.creditRating] ?? 0.70;
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

  const simulatedDefaultRate = defaults / iterations;
  const expectedPortfolioLoss = losses.reduce((sum, l) => sum + l, 0) / iterations;

  // VaR(95%) and CVaR
  const sortedLosses = [...losses].sort((a, b) => a - b);
  const var95Index = Math.floor(iterations * 0.95);
  const worstCaseLoss = sortedLosses[var95Index] ?? 0;
  const tailLosses = sortedLosses.slice(var95Index);
  const tailRiskLoss = tailLosses.length > 0
    ? tailLosses.reduce((sum, l) => sum + l, 0) / tailLosses.length
    : 0;

  // Step 8: Risk narrative
  const pctDisplay = (simulatedDefaultRate * 100).toFixed(2);
  const riskNarrative = `${input.creditRating} loan ($${input.loanAmount}): ${riskBand}. Simulated default rate: ${pctDisplay}%. Expected loss: $${expectedPortfolioLoss.toFixed(2)}. VaR(95%): $${worstCaseLoss.toFixed(2)}. Tail risk: $${tailRiskLoss.toFixed(2)}`;

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
