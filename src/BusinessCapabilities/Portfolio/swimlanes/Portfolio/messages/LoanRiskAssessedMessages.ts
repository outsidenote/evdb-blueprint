import type { ILoanRiskAssessed } from "../events/LoanRiskAssessed.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";

export const loanRiskAssessedMessages = (
  payload: Readonly<ILoanRiskAssessed>,
  _views: unknown,
  metadata: IEvDbEventMetadata,
) => {
  return [
    EvDbMessage.createFromMetadata(metadata, "LoanRiskAssessed", {
      portfolioId: payload.portfolioId,
      acquisitionDate: payload.acquisitionDate,
      borrowerName: payload.borrowerName,
      capitalRequirement: payload.capitalRequirement,
      creditRating: payload.creditRating,
      expectedLoss: payload.expectedLoss,
      interestRate: payload.interestRate,
      loanAmount: payload.loanAmount,
      loanId: payload.loanId,
      maturityDate: payload.maturityDate,
      probabilityOfDefault: payload.probabilityOfDefault,
      riskBand: payload.riskBand,
      expectedPortfolioLoss: payload.expectedPortfolioLoss,
      riskNarrative: payload.riskNarrative,
      simulatedDefaultRate: payload.simulatedDefaultRate,
      tailRiskLoss: payload.tailRiskLoss,
      worstCaseLoss: payload.worstCaseLoss,
    }),
  ];
};
