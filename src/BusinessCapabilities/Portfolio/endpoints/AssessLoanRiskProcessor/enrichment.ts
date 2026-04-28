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
  // Step 1: Probability of Default (as decimal fraction)
  // AAA→0.01%, AA→0.02%, A→0.05%, BBB→0.20%, BB→1.00%, B→3.00%, CCC→10.00%
  const pdMap: Record<string, number> = {
    AAA: 0.0001,
    AA: 0.0002,
    A: 0.0005,
    BBB: 0.002,
    BB: 0.01,
    B: 0.03,
    CCC: 0.10,
  };

  // Step 2: Basel III standardized risk weights
  // AAA→0.20, AA→0.25, A→0.35, BBB→0.50, BB→0.75, B→1.00, CCC→1.50
  const riskWeightMap: Record<string, number> = {
    AAA: 0.20,
    AA: 0.25,
    A: 0.35,
    BBB: 0.50,
    BB: 0.75,
    B: 1.00,
    CCC: 1.50,
  };

  // Recovery rates: AAA-A→0.70, BBB→0.55, BB→0.40, B→0.30, CCC→0.20
  const recoveryRateMap: Record<string, number> = {
    AAA: 0.70,
    AA: 0.70,
    A: 0.70,
    BBB: 0.55,
    BB: 0.40,
    B: 0.30,
    CCC: 0.20,
  };

  const probabilityOfDefault = pdMap[input.creditRating] ?? 0;
  const baseRiskWeight = riskWeightMap[input.creditRating] ?? 0;
  const recoveryRate = recoveryRateMap[input.creditRating] ?? 0.50;

  // Maturity adjustment: if maturity > 5 years, multiply risk weight by 1.15
  const now = new Date();
  const maturityTime = input.maturityDate instanceof Date ? input.maturityDate.getTime() : NaN;
  const yearsToMaturity = isNaN(maturityTime) ? 0 : (maturityTime - now.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const adjustedRiskWeight = yearsToMaturity > 5 ? baseRiskWeight * 1.15 : baseRiskWeight;

  // Step 3: Capital requirement = loanAmount × adjustedRiskWeight × 0.08
  const capitalRequirement = Math.round(input.loanAmount * adjustedRiskWeight * 0.08 * 100) / 100;

  // Step 4: Expected loss = loanAmount × PD × LGD (45%)
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

  // Step 6: Monte Carlo simulation — 1000 iterations
  const iterations = 1000;
  const losses: number[] = [];
  let defaults = 0;

  for (let i = 0; i < iterations; i++) {
    const random = Math.random();
    if (random < probabilityOfDefault) {
      defaults++;
      losses.push(input.loanAmount * (1 - recoveryRate));
    } else {
      losses.push(0);
    }
  }

  // Step 7: Simulation statistics
  // simulatedDefaultRate = defaults / 1000 (approximates PD)
  const simulatedDefaultRate = Math.round((defaults / iterations) * 10000) / 10000;
  const totalLoss = losses.reduce((sum, l) => sum + l, 0);
  const expectedPortfolioLoss = Math.round((totalLoss / iterations) * 100) / 100;

  // VaR at 95% confidence: 95th percentile of sorted losses
  const sortedLosses = [...losses].sort((a, b) => a - b);
  const var95Index = Math.floor(iterations * 0.95);
  const worstCaseLoss = Math.round(sortedLosses[var95Index] * 100) / 100;

  // CVaR / Expected Shortfall: average of worst 5% scenarios
  const tailLosses = sortedLosses.slice(var95Index);
  const tailTotal = tailLosses.reduce((sum, l) => sum + l, 0);
  const tailRiskLoss = Math.round((tailTotal / tailLosses.length) * 100) / 100;

  // Step 8: Risk narrative
  const riskNarrative = `${input.creditRating} loan ($${input.loanAmount}): ${riskBand}. Simulated default rate: ${simulatedDefaultRate}%. Expected loss: $${expectedPortfolioLoss}. VaR(95%): $${worstCaseLoss}. Tail risk: $${tailRiskLoss}`;

  return {
    ...input,
    acquisitionDate: now,
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
