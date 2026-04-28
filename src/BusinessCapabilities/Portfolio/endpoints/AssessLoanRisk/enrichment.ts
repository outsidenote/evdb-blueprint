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

// Step 1: Credit rating to probability of default (PD)
const PD_MAP: Record<string, number> = {
  AAA: 0.0001, // 0.01%
  AA: 0.0002,  // 0.02%
  A: 0.0005,   // 0.05%
  BBB: 0.0020, // 0.20%
  BB: 0.0100,  // 1.00%
  B: 0.0300,   // 3.00%
  CCC: 0.1000, // 10.00%
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

// Step 6: Recovery rates by rating group (AAA-A share 0.70)
const RECOVERY_RATE_MAP: Record<string, number> = {
  AAA: 0.70,
  AA: 0.70,
  A: 0.70,
  BBB: 0.55,
  BB: 0.40,
  B: 0.30,
  CCC: 0.20,
};

// Step 5: Derive riskBand from adjusted risk weight
function getRiskBand(adjustedRiskWeight: number): string {
  if (adjustedRiskWeight <= 0.30) return "Investment Grade - Low";
  if (adjustedRiskWeight <= 0.55) return "Investment Grade - Medium";
  if (adjustedRiskWeight <= 1.00) return "Speculative - High";
  return "Speculative - Critical";
}

const FIVE_YEARS_MS = 5 * 365.25 * 24 * 60 * 60 * 1000;
const MONTE_CARLO_ITERATIONS = 1000;

export async function enrich(input: AssessLoanRiskEnrichmentInput): Promise<AssessLoanRiskEnrichmentOutput> {
  const { creditRating, loanAmount, maturityDate } = input;

  // acquisitionDate is when the risk assessment is performed
  const acquisitionDate = new Date();

  // Step 1: Map credit rating to probability of default
  const probabilityOfDefault = PD_MAP[creditRating] ?? 0;

  // Step 2: Calculate Basel III risk weight, adjust for maturity > 5 years
  const baseRiskWeight = RISK_WEIGHT_MAP[creditRating] ?? 0;
  const timeToMaturityMs = maturityDate.getTime() - acquisitionDate.getTime();
  const adjustedRiskWeight = timeToMaturityMs > FIVE_YEARS_MS
    ? baseRiskWeight * 1.15
    : baseRiskWeight;

  // Step 3: capitalRequirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = Math.round(loanAmount * adjustedRiskWeight * 0.08 * 100) / 100;

  // Step 4: expectedLoss = loanAmount × PD × LGD (45%)
  const expectedLoss = Math.round(loanAmount * probabilityOfDefault * 0.45 * 100) / 100;

  // Step 5: riskBand from adjusted risk weight
  const riskBand = getRiskBand(adjustedRiskWeight);

  // Step 6: Monte Carlo simulation (1000 iterations)
  const recoveryRate = RECOVERY_RATE_MAP[creditRating] ?? 0.70;
  const losses = new Array<number>(MONTE_CARLO_ITERATIONS).fill(0);
  let defaultCount = 0;

  for (let i = 0; i < MONTE_CARLO_ITERATIONS; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaultCount++;
      losses[i] = loanAmount * (1 - recoveryRate);
    }
  }

  // Step 7: Compute simulation results
  const simulatedDefaultRate = defaultCount / MONTE_CARLO_ITERATIONS;
  const expectedPortfolioLoss = losses.reduce((sum, l) => sum + l, 0) / MONTE_CARLO_ITERATIONS;

  const sortedLosses = [...losses].sort((a, b) => a - b);
  const var95Index = Math.floor(MONTE_CARLO_ITERATIONS * 0.95);
  const worstCaseLoss = sortedLosses[var95Index] ?? 0;
  const tailLosses = sortedLosses.slice(var95Index);
  const tailRiskLoss = tailLosses.reduce((sum, l) => sum + l, 0) / tailLosses.length;

  // Step 8: Build risk narrative
  const simRatePct = (simulatedDefaultRate * 100).toFixed(2);
  const riskNarrative = `${creditRating} loan ($${loanAmount}): ${riskBand}. Simulated default rate: ${simRatePct}%. Expected loss: $${expectedPortfolioLoss.toFixed(2)}. VaR(95%): $${worstCaseLoss.toFixed(2)}. Tail risk: $${tailRiskLoss.toFixed(2)}`;

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
