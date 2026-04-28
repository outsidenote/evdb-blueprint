import type { ILoanRejectedFromPortfolio } from "../events/LoanRejectedFromPortfolio.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";

export const loanRejectedFromPortfolioMessages = (
  payload: Readonly<ILoanRejectedFromPortfolio>,
  _views: unknown,
  metadata: IEvDbEventMetadata,
) => {
  return [
    EvDbMessage.createFromMetadata(metadata, "LoanRejectedFromPortfolio", {
      portfolioId: payload.portfolioId,
      acquisitionDate: payload.acquisitionDate,
      borrowerName: payload.borrowerName,
      creditRating: payload.creditRating,
      interestRate: payload.interestRate,
      loanAmount: payload.loanAmount,
      loanId: payload.loanId,
      maturityDate: payload.maturityDate,
      errorMessage: payload.errorMessage,
    }),
  ];
};
