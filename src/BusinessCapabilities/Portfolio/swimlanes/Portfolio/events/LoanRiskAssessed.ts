export interface ILoanRiskAssessed {
  readonly acquisitionDate: Date;
  readonly borrowerName: string;
  readonly capitalRequirement: number;
  readonly creditRating: string;
  readonly expectedLoss: number;
  readonly expectedPortfolioLoss: number;
  readonly interestRate: number;
  readonly loanAmount: number;
  readonly loanId: string;
  readonly maturityDate: Date;
  readonly portfolioId: string;
  readonly probabilityOfDefault: number;
  readonly riskBand: string;
  readonly riskNarrative: string;
  readonly simulatedDefaultRate: number;
  readonly tailRiskLoss: number;
  readonly worstCaseLoss: number;
}
