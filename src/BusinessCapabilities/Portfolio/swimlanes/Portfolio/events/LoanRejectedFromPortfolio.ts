export interface ILoanRejectedFromPortfolio {
  readonly portfolioId: string;
  readonly acquisitionDate: Date;
  readonly borrowerName: string;
  readonly creditRating: string;
  readonly interestRate: number;
  readonly loanAmount: number;
  readonly loanId: string;
  readonly maturityDate: Date;
  readonly errorMessage: string;
}
