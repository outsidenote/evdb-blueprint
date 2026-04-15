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

// Step 1: Probability of default by credit rating (as decimal fraction)
const PD_MAP: Record<string, number> = {
  AAA: 0.0001, // 0.01%
  AA:  0.0002, // 0.02%
  A:   0.0005, // 0.05%
  BBB: 0.002,  // 0.20%
  BB:  0.01,   // 1.00%
  B:   0.03,   // 3.00%
  CCC: 0.10,   // 10.00%
};

// Step 2: Basel III standardised risk weights
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function enrich(input: AssessLoanRiskProcessorEnrichmentInput): Promise<AssessLoanRiskProcessorEnrichmentOutput> {
  const today = new Date();

  // Step 1: Probability of default (default to BBB for unknown ratings)
  const probabilityOfDefault = PD_MAP[input.creditRating] ?? PD_MAP["BBB"];

  // Step 2: Risk weight with maturity adjustment
  const baseRiskWeight = RISK_WEIGHT_MAP[input.creditRating] ?? RISK_WEIGHT_MAP["BBB"];
  const maturityMs = input.maturityDate instanceof Date ? input.maturityDate.getTime() : NaN;
  const maturityYears = isNaN(maturityMs) ? 0 : (maturityMs - today.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const adjustedRiskWeight = maturityYears > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = round2(input.loanAmount * adjustedRiskWeight * 0.08);

  // Step 4: Expected loss = loanAmount × PD × LGD(0.45)
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

  // Step 6: Monte Carlo simulation (1000 iterations)
  const ITERATIONS = 1000;
  const recoveryRate = RECOVERY_RATE_MAP[input.creditRating] ?? RECOVERY_RATE_MAP["BBB"];
  const lossPerDefault = input.loanAmount * (1 - recoveryRate);
  let defaults = 0;
  const losses: number[] = new Array(ITERATIONS);

  for (let i = 0; i < ITERATIONS; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses[i] = lossPerDefault;
    } else {
      losses[i] = 0;
    }
  }

  // Step 7: Simulation results
  const simulatedDefaultRate = round2(defaults / ITERATIONS);
  const expectedPortfolioLoss = round2(losses.reduce((sum, l) => sum + l, 0) / ITERATIONS);

  const sortedLosses = [...losses].sort((a, b) => a - b);
  const var95Index = Math.floor(0.95 * ITERATIONS); // 950th value (0-based)
  const worstCaseLoss = round2(sortedLosses[var95Index]);

  const tailScenarios = sortedLosses.slice(var95Index); // worst 5% (50 values)
  const tailRiskLoss = round2(tailScenarios.reduce((sum, l) => sum + l, 0) / tailScenarios.length);

  // Step 8: Risk narrative
  const simulatedDefaultRatePct = round2(simulatedDefaultRate * 100);
  const riskNarrative = `${input.creditRating} loan ($${input.loanAmount}): ${riskBand}. Simulated default rate: ${simulatedDefaultRatePct}%. Expected loss: $${expectedPortfolioLoss}. VaR(95%): $${worstCaseLoss}. Tail risk: $${tailRiskLoss}`;

  return {
    ...input,
    acquisitionDate: today,
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
