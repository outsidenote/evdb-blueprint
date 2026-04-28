import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";

import type { ILoanRejectedFromPortfolio } from "./events/LoanRejectedFromPortfolio.js";
import type { ILoanAddedToPortfolio } from "./events/LoanAddedToPortfolio.js";
import { defaultState as sliceStateAddLoanToPortfolioDefaultState, viewName as sliceStateAddLoanToPortfolioViewName } from "./views/SliceStateAddLoanToPortfolio/state.js";
import { handlers as sliceStateAddLoanToPortfolioHandlers } from "./views/SliceStateAddLoanToPortfolio/handlers.js";
import { loanAddedToPortfolioMessages } from "./messages/LoanAddedToPortfolioMessages.js";
import type { ILoanRiskAssessed } from "./events/LoanRiskAssessed.js";
import { loanRiskAssessedMessages } from "./messages/LoanRiskAssessedMessages.js";
import { loanRejectedFromPortfolioMessages } from "./messages/LoanRejectedFromPortfolioMessages.js";
const PortfolioStreamFactory = new StreamFactoryBuilder("PortfolioStream")
  .withEvent("LoanRejectedFromPortfolio").asType<ILoanRejectedFromPortfolio>()
  .withEvent("LoanAddedToPortfolio").asType<ILoanAddedToPortfolio>()
  .withView(sliceStateAddLoanToPortfolioViewName, sliceStateAddLoanToPortfolioDefaultState, sliceStateAddLoanToPortfolioHandlers)
  .withMessages("LoanAddedToPortfolio", loanAddedToPortfolioMessages)
  .withEvent("LoanRiskAssessed").asType<ILoanRiskAssessed>()
  .withMessages("LoanRiskAssessed", loanRiskAssessedMessages)
  .withMessages("LoanRejectedFromPortfolio", loanRejectedFromPortfolioMessages)
  .build();

export default PortfolioStreamFactory;
export type PortfolioStreamType = typeof PortfolioStreamFactory.StreamType;
