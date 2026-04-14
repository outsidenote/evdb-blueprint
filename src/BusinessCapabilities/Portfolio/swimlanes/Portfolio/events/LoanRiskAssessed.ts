export interface ILoanRiskAssessed {
  readonly portfolioId: string;
  readonly acquisitionDate: Date;
  readonly borrowerName: string;
  readonly capitalRequirement: number;
  readonly creditRating: string;
  readonly expectedLoss: number;
  readonly interestRate: number;
  readonly loanAmount: number;
  readonly loanId: string;
  readonly maturityDate: Date;
  readonly probabilityOfDefault: number;
  readonly riskBand: string;
  readonly expectedPortfolioLoss: number;
  readonly riskNarrative: string;
  readonly simulatedDefaultRate: number;
  readonly tailRiskLoss: number;
  readonly worstCaseLoss: number;
}
