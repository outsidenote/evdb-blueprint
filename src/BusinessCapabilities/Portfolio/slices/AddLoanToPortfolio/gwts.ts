import type { AddLoanToPortfolio } from "./command.js";
import type { SliceStateAddLoanToPortfolioViewState } from "#BusinessCapabilities/Portfolio/swimlanes/Portfolio/views/SliceStateAddLoanToPortfolio/state.js";

/**
 * Named spec predicates derived from the event model's GWT specifications.
 * Each function maps 1:1 to a named spec in the event model diagram.
 */

// Investment-grade cutoff: BBB and above are acceptable; BB and below (CCC, CC, C, D) are not.
const CREDIT_RATINGS_ORDER = ["AAA", "AA", "A", "BBB", "BB", "B", "CCC", "CC", "C", "D"];
const MIN_ACCEPTABLE_RATING_INDEX = CREDIT_RATINGS_ORDER.indexOf("BBB"); // 3

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
  const commandRatingIndex = CREDIT_RATINGS_ORDER.indexOf(command.creditRating);
  return state.portfolioId !== "" && commandRatingIndex > MIN_ACCEPTABLE_RATING_INDEX;
};

/**
 * spec: portfolioRatingMaintained
 * GIVEN state fields: portfolioId, acquisitionDate, borrowerName, creditRating, interestRate, loanAmount, loanId, maturityDate
 * WHEN command fields: portfolioId, acquisitionDate, borrowerName, creditRating, interestRate, loanAmount, loanId, maturityDate
 * THEN: LoanAddedToPortfolio
 */
export const portfolioRatingMaintained = (state: SliceStateAddLoanToPortfolioViewState, command: AddLoanToPortfolio): boolean =>
  !amountLessThanZero(state, command) && !portfolioRatingBreached(state, command);
