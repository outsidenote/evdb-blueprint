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

export async function enrich(input: AssessLoanRiskProcessorEnrichmentInput): Promise<AssessLoanRiskProcessorEnrichmentOutput> {
  const acquisitionDate = new Date();

  // Step 1: Map credit rating to probability of default
  const pdMap: Record<string, number> = {
    AAA: 0.0001,
    AA: 0.0002,
    A: 0.0005,
    BBB: 0.002,
    BB: 0.01,
    B: 0.03,
    CCC: 0.10,
  };
  const probabilityOfDefault = pdMap[input.creditRating] ?? 0;

  // Step 2: Basel III standardized risk weight + maturity adjustment
  const riskWeightMap: Record<string, number> = {
    AAA: 0.20,
    AA: 0.25,
    A: 0.35,
    BBB: 0.50,
    BB: 0.75,
    B: 1.00,
    CCC: 1.50,
  };
  const baseRiskWeight = riskWeightMap[input.creditRating] ?? 0;
  const yearsToMaturity = (input.maturityDate.getTime() - acquisitionDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  const adjustedRiskWeight = yearsToMaturity > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement
  const capitalRequirement = Math.round(input.loanAmount * adjustedRiskWeight * 0.08 * 100) / 100;

  // Step 4: Expected loss (LGD = 45%)
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
  const recoveryRateMap: Record<string, number> = {
    AAA: 0.70,
    AA: 0.70,
    A: 0.70,
    BBB: 0.55,
    BB: 0.40,
    B: 0.30,
    CCC: 0.20,
  };
  const recoveryRate = recoveryRateMap[input.creditRating] ?? 0.45;

  const iterations = 1000;
  const losses: number[] = new Array(iterations);
  let defaults = 0;
  for (let i = 0; i < iterations; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses[i] = input.loanAmount * (1 - recoveryRate);
    } else {
      losses[i] = 0;
    }
  }

  // Step 7: Compute simulation results
  const simulatedDefaultRate = Math.round((defaults / iterations) * 10000) / 10000;

  const totalLoss = losses.reduce((sum, l) => sum + l, 0);
  const expectedPortfolioLoss = Math.round((totalLoss / iterations) * 100) / 100;

  const sortedLosses = losses.slice().sort((a, b) => a - b);
  const varIndex = Math.floor(iterations * 0.95);
  const worstCaseLoss = Math.round(sortedLosses[varIndex] * 100) / 100;

  const tailCount = Math.ceil(iterations * 0.05);
  const tailLosses = sortedLosses.slice(-tailCount);
  const tailRiskLoss = Math.round((tailLosses.reduce((sum, l) => sum + l, 0) / tailCount) * 100) / 100;

  // Step 8: Risk narrative
  const simulatedDefaultRatePct = Math.round(simulatedDefaultRate * 10000) / 100;
  const riskNarrative = `${input.creditRating} loan ($${input.loanAmount}): ${riskBand}. Simulated default rate: ${simulatedDefaultRatePct}%. Expected loss: $${expectedPortfolioLoss}. VaR(95%): $${worstCaseLoss}. Tail risk: $${tailRiskLoss}`;

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
