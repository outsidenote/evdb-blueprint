export type SliceStateAddLoanToPortfolioViewState = {
  readonly portfolioId: string;
  readonly acquisitionDate: Date;
  readonly borrowerName: string;
  readonly creditRating: string;
  readonly interestRate: number;
  readonly loanAmount: number;
  readonly loanId: string;
  readonly maturityDate: Date;
}

export const viewName = "SliceStateAddLoanToPortfolio" as const;
export const defaultState: SliceStateAddLoanToPortfolioViewState = {
  portfolioId: "",
  acquisitionDate: new Date(0),
  borrowerName: "",
  creditRating: "",
  interestRate: 0,
  loanAmount: 0,
  loanId: "",
  maturityDate: new Date(0),
};
