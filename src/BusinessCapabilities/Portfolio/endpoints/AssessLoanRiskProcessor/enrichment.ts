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
  const { creditRating, loanAmount, maturityDate } = input;

  // Step 1: Map credit rating to probability of default (PD as decimal)
  const pdMap: Record<string, number> = {
    AAA: 0.0001,  // 0.01%
    AA:  0.0002,  // 0.02%
    A:   0.0005,  // 0.05%
    BBB: 0.002,   // 0.20%
    BB:  0.01,    // 1.00%
    B:   0.03,    // 3.00%
    CCC: 0.10,    // 10.00%
  };
  const probabilityOfDefault = pdMap[creditRating] ?? 0;

  // Step 2: Basel III standardized risk weight
  const baseRiskWeightMap: Record<string, number> = {
    AAA: 0.20,
    AA:  0.25,
    A:   0.35,
    BBB: 0.50,
    BB:  0.75,
    B:   1.00,
    CCC: 1.50,
  };
  const baseRiskWeight = baseRiskWeightMap[creditRating] ?? 0;

  // Adjust for maturity > 5 years — guard against runtime non-Date values
  const now = new Date();
  const maturityMs = maturityDate instanceof Date ? maturityDate.getTime() : NaN;
  const yearsToMaturity = !isNaN(maturityMs) ? (maturityMs - now.getTime()) / (1000 * 60 * 60 * 24 * 365.25) : -1;
  const adjustedRiskWeight = yearsToMaturity > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: capitalRequirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = Math.round(loanAmount * adjustedRiskWeight * 0.08 * 100) / 100;

  // Step 4: expectedLoss = loanAmount × PD × LGD (45%)
  const expectedLoss = Math.round(loanAmount * probabilityOfDefault * 0.45 * 100) / 100;

  // Step 5: riskBand from adjustedRiskWeight
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

  // Step 6 & 7: Monte Carlo simulation — 1000 iterations
  const recoveryRateMap: Record<string, number> = {
    AAA: 0.70,
    AA:  0.70,
    A:   0.70,
    BBB: 0.55,
    BB:  0.40,
    B:   0.30,
    CCC: 0.20,
  };
  const recoveryRate = recoveryRateMap[creditRating] ?? 0.55;

  const iterations = 1000;
  const losses: number[] = [];
  let defaults = 0;

  for (let i = 0; i < iterations; i++) {
    if (Math.random() < probabilityOfDefault) {
      defaults++;
      losses.push(loanAmount * (1 - recoveryRate));
    } else {
      losses.push(0);
    }
  }

  // simulatedDefaultRate approximates the PD (fraction, not percentage)
  const simulatedDefaultRate = defaults / iterations;

  const totalLoss = losses.reduce((acc, l) => acc + l, 0);
  const expectedPortfolioLoss = Math.round((totalLoss / iterations) * 100) / 100;

  // worstCaseLoss = 95th percentile (VaR at 95% confidence)
  const sorted = losses.slice().sort((a, b) => a - b);
  const var95Index = Math.floor(iterations * 0.95);
  const worstCaseLoss = Math.round((sorted[var95Index] ?? 0) * 100) / 100;

  // tailRiskLoss = average of worst 5% scenarios (CVaR / Expected Shortfall)
  const tailSlice = sorted.slice(var95Index);
  const tailTotal = tailSlice.reduce((acc, l) => acc + l, 0);
  const tailRiskLoss = Math.round((tailSlice.length > 0 ? tailTotal / tailSlice.length : 0) * 100) / 100;

  // Step 8: riskNarrative
  const riskNarrative = `${creditRating} loan ($${loanAmount}): ${riskBand}. Simulated default rate: ${simulatedDefaultRate}%. Expected loss: $${expectedPortfolioLoss}. VaR(95%): $${worstCaseLoss}. Tail risk: $${tailRiskLoss}`;

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
