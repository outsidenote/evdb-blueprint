import type { ILoanAddedToPortfolio } from "../events/LoanAddedToPortfolio.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import { endpointIdentity } from "#BusinessCapabilities/Portfolio/endpoints/AssessLoanRisk/pg-boss/index.js";
import { createPgBossQueueMessageFromMetadata } from "#abstractions/endpoints/queueMessage.js";

export const loanAddedToPortfolioMessages = (
  payload: Readonly<ILoanAddedToPortfolio>,
  _views: unknown,
  metadata: IEvDbEventMetadata,
) => {
  return [
    createPgBossQueueMessageFromMetadata(
      [endpointIdentity.queueName],
      metadata,
      "AssessLoanRisk",
      {
      portfolioId: payload.portfolioId,
      acquisitionDate: payload.acquisitionDate,
      borrowerName: payload.borrowerName,
      creditRating: payload.creditRating,
      interestRate: payload.interestRate,
      loanAmount: payload.loanAmount,
      loanId: payload.loanId,
      maturityDate: payload.maturityDate,
      },
    ),
    EvDbMessage.createFromMetadata(metadata, "LoanAddedToPortfolio", {
      portfolioId: payload.portfolioId,
      acquisitionDate: payload.acquisitionDate,
      borrowerName: payload.borrowerName,
      creditRating: payload.creditRating,
      interestRate: payload.interestRate,
      loanAmount: payload.loanAmount,
      loanId: payload.loanId,
      maturityDate: payload.maturityDate,
    }),
  ];
};
