import type { AddLoanToPortfolio } from "./command.js";
import type { SliceStateAddLoanToPortfolioViewState } from "#BusinessCapabilities/Portfolio/swimlanes/Portfolio/views/SliceStateAddLoanToPortfolio/state.js";

/**
 * Named spec predicates derived from the event model's GWT specifications.
 * Each function maps 1:1 to a named spec in the event model diagram.
 */

// Standard credit rating scale, ordered from best (index 0) to worst (highest index).
// Unknown/invalid ratings get indexOf() === -1, treated as better than any known rating.
const RATING_ORDER = ["AAA", "AA", "A", "BBB", "BB", "B", "CCC", "CC", "C", "D"];

/**
 * spec: amountLessThanZero
 * GIVEN state fields: none
 * WHEN command fields: portfolioId, acquisitionDate, borrowerName, creditRating, interestRate, loanAmount, loanId, maturityDate
 * THEN: LoanRejectedFromPortfolio
 */
export const amountLessThanZero = (state: SliceStateAddLoanToPortfolioViewState, command: AddLoanToPortfolio): boolean =>
  command.loanAmount <= 0;

/**
 * spec: portfolioRatingBreached
 * GIVEN state fields: portfolioId, acquisitionDate, borrowerName, creditRating, interestRate, loanAmount, loanId, maturityDate
 * WHEN command fields: portfolioId, acquisitionDate, borrowerName, creditRating, interestRate, loanAmount, loanId, maturityDate
 * THEN: LoanRejectedFromPortfolio
 */
export const portfolioRatingBreached = (state: SliceStateAddLoanToPortfolioViewState, command: AddLoanToPortfolio): boolean => {
  if (command.loanAmount <= 0) return false;
  if (!state.portfolioId) return false;
  const stateRatingIdx = RATING_ORDER.indexOf(state.creditRating);
  const commandRatingIdx = RATING_ORDER.indexOf(command.creditRating);
  return commandRatingIdx > stateRatingIdx;
};

/**
 * spec: portfolioRatingMaintained
 * GIVEN state fields: portfolioId, acquisitionDate, borrowerName, creditRating, interestRate, loanAmount, loanId, maturityDate
 * WHEN command fields: portfolioId, acquisitionDate, borrowerName, creditRating, interestRate, loanAmount, loanId, maturityDate
 * THEN: LoanAddedToPortfolio
 */
export const portfolioRatingMaintained = (state: SliceStateAddLoanToPortfolioViewState, command: AddLoanToPortfolio): boolean =>
  command.loanAmount > 0 && !portfolioRatingBreached(state, command);
