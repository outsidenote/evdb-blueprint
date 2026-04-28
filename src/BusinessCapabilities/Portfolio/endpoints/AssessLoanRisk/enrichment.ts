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

export async function enrich(input: AssessLoanRiskEnrichmentInput): Promise<AssessLoanRiskEnrichmentOutput> {
  // Step 1: Map credit rating to probability of default (PD)
  const pdMap: Record<string, number> = {
    AAA: 0.0001, // 0.01%
    AA:  0.0002, // 0.02%
    A:   0.0005, // 0.05%
    BBB: 0.0020, // 0.20%
    BB:  0.0100, // 1.00%
    B:   0.0300, // 3.00%
    CCC: 0.1000, // 10.00%
  };
  const probabilityOfDefault = pdMap[input.creditRating] ?? 0;

  // Step 2: Basel III risk weight; adjust by 1.15 if maturity > 5 years
  const riskWeightMap: Record<string, number> = {
    AAA: 0.20,
    AA:  0.25,
    A:   0.35,
    BBB: 0.50,
    BB:  0.75,
    B:   1.00,
    CCC: 1.50,
  };
  const baseRiskWeight = riskWeightMap[input.creditRating] ?? 0;
  const maturityMs = input.maturityDate instanceof Date ? input.maturityDate.getTime() : NaN;
  const yearsToMaturity = (maturityMs - Date.now()) / (1000 * 60 * 60 * 24 * 365.25);
  const adjustedRiskWeight = yearsToMaturity > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = input.loanAmount * adjustedRiskWeight * 0.08;

  // Step 4: Expected loss = loanAmount × PD × LGD (45%)
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
  const recoveryRateMap: Record<string, number> = {
    AAA: 0.70,
    AA:  0.70,
    A:   0.70,
    BBB: 0.55,
    BB:  0.40,
    B:   0.30,
    CCC: 0.20,
  };
  const recoveryRate = recoveryRateMap[input.creditRating] ?? 0;

  const iterations = 1000;
  const losses: number[] = [];
  let defaults = 0;

  for (let i = 0; i < iterations; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses.push(input.loanAmount * (1 - recoveryRate));
    } else {
      losses.push(0);
    }
  }

  // Step 7: Simulation results
  const simulatedDefaultRate = defaults / iterations;
  const expectedPortfolioLoss = losses.reduce((sum, l) => sum + l, 0) / iterations;

  const sortedLosses = [...losses].sort((a, b) => a - b);
  const var95Index = Math.floor(iterations * 0.95); // index 950 = 95th percentile
  const worstCaseLoss = sortedLosses[var95Index] ?? 0;

  // CVaR: average of worst 5% scenarios (indices 950–999)
  const tailLosses = sortedLosses.slice(var95Index);
  const tailRiskLoss =
    tailLosses.length > 0
      ? tailLosses.reduce((sum, l) => sum + l, 0) / tailLosses.length
      : 0;

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
