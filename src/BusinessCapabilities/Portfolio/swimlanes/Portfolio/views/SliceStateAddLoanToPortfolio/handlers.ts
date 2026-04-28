import type { ILoanAddedToPortfolio } from "../../events/LoanAddedToPortfolio.js";
import type { SliceStateAddLoanToPortfolioViewState } from "./state.js";

export const handlers = {
  LoanAddedToPortfolio: (
    state: SliceStateAddLoanToPortfolioViewState,
    event: ILoanAddedToPortfolio,
  ): SliceStateAddLoanToPortfolioViewState => ({
    ...state,
    portfolioId: event.portfolioId,
    acquisitionDate: event.acquisitionDate,
    borrowerName: event.borrowerName,
    creditRating: event.creditRating,
    interestRate: event.interestRate,
    loanAmount: event.loanAmount,
    loanId: event.loanId,
    maturityDate: event.maturityDate,
  }),

};
