import type { AddLoanToPortfolio } from "./command.js";
import type { SliceStateAddLoanToPortfolioViewState } from "#BusinessCapabilities/Portfolio/swimlanes/Portfolio/views/SliceStateAddLoanToPortfolio/state.js";

/**
 * Named spec predicates derived from the event model's GWT specifications.
 * Each function maps 1:1 to a named spec in the event model diagram.
 */

const RATING_ORDER = [
  "D", "C", "CC", "CCC", "B-", "B", "B+",
  "BB-", "BB", "BB+", "BBB-", "BBB", "BBB+",
  "A-", "A", "A+", "AA-", "AA", "AA+", "AAA",
];
const ratingIndex = (rating: string): number => {
  const idx = RATING_ORDER.indexOf(rating);
  return idx >= 0 ? idx : RATING_ORDER.length;
};
const MIN_PORTFOLIO_RATING_INDEX = RATING_ORDER.indexOf("BBB");

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
export const portfolioRatingBreached = (state: SliceStateAddLoanToPortfolioViewState, command: AddLoanToPortfolio): boolean =>
  ratingIndex(command.creditRating) < MIN_PORTFOLIO_RATING_INDEX;

/**
 * spec: portfolioRatingMaintained
 * GIVEN state fields: portfolioId, acquisitionDate, borrowerName, creditRating, interestRate, loanAmount, loanId, maturityDate
 * WHEN command fields: portfolioId, acquisitionDate, borrowerName, creditRating, interestRate, loanAmount, loanId, maturityDate
 * THEN: LoanAddedToPortfolio
 */
export const portfolioRatingMaintained = (state: SliceStateAddLoanToPortfolioViewState, command: AddLoanToPortfolio): boolean =>
  ratingIndex(command.creditRating) >= MIN_PORTFOLIO_RATING_INDEX;
