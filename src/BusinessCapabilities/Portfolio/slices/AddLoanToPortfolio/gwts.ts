import type { AddLoanToPortfolio } from "./command.js";
import type { SliceStateAddLoanToPortfolioViewState } from "#BusinessCapabilities/Portfolio/swimlanes/Portfolio/views/SliceStateAddLoanToPortfolio/state.js";

/**
 * Named spec predicates derived from the event model's GWT specifications.
 * Each function maps 1:1 to a named spec in the event model diagram.
 */

/**
 * spec: amountLessThanZero
 * GIVEN state fields: none
 * WHEN command fields: portfolioId, acquisitionDate, borrowerName, creditRating, interestRate, loanAmount, loanId, maturityDate
 * THEN: LoanRejectedFromPortfolio
 */
export const amountLessThanZero = (_state: SliceStateAddLoanToPortfolioViewState, command: AddLoanToPortfolio): boolean =>
  command.loanAmount <= 0;

/**
 * spec: portfolioRatingBreached
 * GIVEN state fields: portfolioId, acquisitionDate, borrowerName, creditRating, interestRate, loanAmount, loanId, maturityDate
 * WHEN command fields: portfolioId, acquisitionDate, borrowerName, creditRating, interestRate, loanAmount, loanId, maturityDate
 * THEN: LoanRejectedFromPortfolio
 */
const SPECULATIVE_GRADE = new Set(["CCC+", "CCC", "CCC-", "CC", "C", "D"]);

export const portfolioRatingBreached = (state: SliceStateAddLoanToPortfolioViewState, command: AddLoanToPortfolio): boolean =>
  state.portfolioId !== "" && SPECULATIVE_GRADE.has(command.creditRating);

/**
 * spec: portfolioRatingMaintained
 * GIVEN state fields: portfolioId, acquisitionDate, borrowerName, creditRating, interestRate, loanAmount, loanId, maturityDate
 * WHEN command fields: portfolioId, acquisitionDate, borrowerName, creditRating, interestRate, loanAmount, loanId, maturityDate
 * THEN: LoanAddedToPortfolio
 */
export const portfolioRatingMaintained = (_state: SliceStateAddLoanToPortfolioViewState, _command: AddLoanToPortfolio): boolean =>
  true;
