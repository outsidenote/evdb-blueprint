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
  const { creditRating, loanAmount, maturityDate } = input;

  // Step 1: Map credit rating to probability of default (PD)
  const pdMap: Record<string, number> = {
    AAA: 0.0001,
    AA: 0.0002,
    A: 0.0005,
    BBB: 0.0020,
    BB: 0.0100,
    B: 0.0300,
    CCC: 0.1000,
  };
  const probabilityOfDefault = pdMap[creditRating] ?? 0.0020;

  // Step 2: Basel III risk weight, adjusted for maturity > 5 years
  const riskWeightMap: Record<string, number> = {
    AAA: 0.20,
    AA: 0.25,
    A: 0.35,
    BBB: 0.50,
    BB: 0.75,
    B: 1.00,
    CCC: 1.50,
  };
  const baseRiskWeight = riskWeightMap[creditRating] ?? 0.50;

  const maturityTime = new Date(maturityDate).getTime();
  const maturityYears = isNaN(maturityTime) ? 0 : (maturityTime - Date.now()) / (1000 * 60 * 60 * 24 * 365);
  const adjustedRiskWeight = maturityYears > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement
  const capitalRequirement = loanAmount * adjustedRiskWeight * 0.08;

  // Step 4: Expected loss (LGD = 45%)
  const expectedLoss = loanAmount * probabilityOfDefault * 0.45;

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

  // Step 6-7: Monte Carlo simulation (1000 iterations)
  const recoveryRateMap: Record<string, number> = {
    AAA: 0.70,
    AA: 0.70,
    A: 0.70,
    BBB: 0.55,
    BB: 0.40,
    B: 0.30,
    CCC: 0.20,
  };
  const recoveryRate = recoveryRateMap[creditRating] ?? 0.55;

  const iterations = 1000;
  let defaults = 0;
  const losses: number[] = [];

  for (let i = 0; i < iterations; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses.push(loanAmount * (1 - recoveryRate));
    } else {
      losses.push(0);
    }
  }

  const simulatedDefaultRate = defaults / iterations;
  const expectedPortfolioLoss = losses.reduce((a, b) => a + b, 0) / iterations;

  const sortedLosses = [...losses].sort((a, b) => a - b);
  const varIndex = Math.floor(iterations * 0.95);
  const worstCaseLoss = sortedLosses[varIndex] ?? 0;

  const tailLosses = sortedLosses.slice(varIndex);
  const tailRiskLoss = tailLosses.length > 0
    ? tailLosses.reduce((a, b) => a + b, 0) / tailLosses.length
    : 0;

  // Step 8: Risk narrative
  const riskNarrative =
    `${creditRating} loan ($${loanAmount}): ${riskBand}. ` +
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
