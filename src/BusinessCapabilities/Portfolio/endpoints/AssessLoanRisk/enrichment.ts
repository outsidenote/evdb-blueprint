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

function getRiskBand(adjustedRiskWeight: number): string {
  if (adjustedRiskWeight <= 0.30) return "Investment Grade - Low";
  if (adjustedRiskWeight <= 0.55) return "Investment Grade - Medium";
  if (adjustedRiskWeight <= 1.00) return "Speculative - High";
  return "Speculative - Critical";
}

export async function enrich(input: AssessLoanRiskEnrichmentInput): Promise<AssessLoanRiskEnrichmentOutput> {
  const { creditRating, loanAmount, maturityDate } = input;

  // Step 1: Map credit rating to probability of default
  const probabilityOfDefault = PD_MAP[creditRating] ?? 0;

  // Step 2: Calculate risk weight (Basel III), adjust for maturity > 5 years
  const baseRiskWeight = RISK_WEIGHT_MAP[creditRating] ?? 1.0;
  const maturityYears = (maturityDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 365.25);
  const adjustedRiskWeight = maturityYears > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement
  const capitalRequirement = loanAmount * adjustedRiskWeight * 0.08;

  // Step 4: Expected loss (LGD assumption 45%)
  const expectedLoss = loanAmount * probabilityOfDefault * 0.45;

  // Step 5: Risk band from adjusted risk weight
  const riskBand = getRiskBand(adjustedRiskWeight);

  // Step 6 & 7: Monte Carlo simulation (1000 iterations)
  const recoveryRate = RECOVERY_RATE_MAP[creditRating] ?? 0.40;
  const lossPerDefault = loanAmount * (1 - recoveryRate);
  let defaults = 0;
  let totalLoss = 0;
  const allLosses: number[] = [];

  for (let i = 0; i < 1000; i++) {
    const random = Math.random();
    if (random < probabilityOfDefault) {
      defaults++;
      totalLoss += lossPerDefault;
      allLosses.push(lossPerDefault);
    } else {
      allLosses.push(0);
    }
  }

  const simulatedDefaultRate = defaults / 1000;
  const expectedPortfolioLoss = totalLoss / 1000;

  // VaR at 95% confidence (95th percentile loss)
  const sortedLosses = [...allLosses].sort((a, b) => a - b);
  const varIndex = Math.floor(1000 * 0.95);
  const worstCaseLoss = sortedLosses[varIndex];

  // CVaR / Expected Shortfall: average of worst 5% scenarios
  const tailLosses = sortedLosses.slice(varIndex);
  const tailRiskLoss = tailLosses.reduce((a, b) => a + b, 0) / tailLosses.length;

  // Step 8: Risk narrative
  const simDefaultPct = (simulatedDefaultRate * 100).toFixed(2);
  const riskNarrative =
    `${creditRating} loan ($${loanAmount}): ${riskBand}. ` +
    `Simulated default rate: ${simDefaultPct}%. ` +
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
