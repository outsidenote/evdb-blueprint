import type { CommandHandler } from "#abstractions/commands/commandHandler.js";
import type { AddLoanToPortfolio } from "./command.js";
import type { PortfolioStreamType } from "#BusinessCapabilities/Portfolio/swimlanes/Portfolio/index.js";
import { unknownPredicate, unknownPredicate, unknownPredicate } from "./gwts.js";

/**
 * Pure command handler for the AddLoanToPortfolio command.
 * ONLY appends events — no I/O, no fetching, no returning values.
 */
export const handleAddLoanToPortfolio: CommandHandler<
  PortfolioStreamType,
  AddLoanToPortfolio
> = (stream, command) => {
  const { portfolioId, acquisitionDate, borrowerName, creditRating, interestRate, loanAmount, loanId, maturityDate } = stream.views.SliceStateAddLoanToPortfolio;

  if (amountLessThanZero(stream.views.SliceStateAddLoanToPortfolio, command)) {
    stream.appendEventLoanRejectedFromPortfolio({
      portfolioId: command.portfolioId,
      acquisitionDate: command.acquisitionDate,
      borrowerName: command.borrowerName,
      creditRating: command.creditRating,
      interestRate: command.interestRate,
      loanAmount: command.loanAmount,
      loanId: command.loanId,
      maturityDate: command.maturityDate,
      errorMessage: "", // TODO: derive from command fields
    });
  } else if (portfolioRatingBreached(stream.views.SliceStateAddLoanToPortfolio, command)) {
    stream.appendEventLoanRejectedFromPortfolio({
      portfolioId: command.portfolioId,
      acquisitionDate: command.acquisitionDate,
      borrowerName: command.borrowerName,
      creditRating: command.creditRating,
      interestRate: command.interestRate,
      loanAmount: command.loanAmount,
      loanId: command.loanId,
      maturityDate: command.maturityDate,
      errorMessage: "", // TODO: derive from command fields
    });
  } else if (portfolioRatingMaintained(stream.views.SliceStateAddLoanToPortfolio, command)) {
    stream.appendEventLoanAddedToPortfolio({
      portfolioId: command.portfolioId,
      acquisitionDate: command.acquisitionDate,
      borrowerName: command.borrowerName,
      creditRating: command.creditRating,
      interestRate: command.interestRate,
      loanAmount: command.loanAmount,
      loanId: command.loanId,
      maturityDate: command.maturityDate,
    });
  } else {
    stream.appendEventLoanRejectedFromPortfolio({
      portfolioId: command.portfolioId,
      acquisitionDate: command.acquisitionDate,
      borrowerName: command.borrowerName,
      creditRating: command.creditRating,
      interestRate: command.interestRate,
      loanAmount: command.loanAmount,
      loanId: command.loanId,
      maturityDate: command.maturityDate,
      errorMessage: "", // TODO: derive from command fields
    });
  }
};
