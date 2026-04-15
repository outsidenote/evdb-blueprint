import type { AddLoanToPortfolio } from "./command.js";
import type { SliceStateAddLoanToPortfolioViewState } from "#BusinessCapabilities/Portfolio/swimlanes/Portfolio/views/SliceStateAddLoanToPortfolio/state.js";

/**
 * Named spec predicates derived from the event model's GWT specifications.
 * Each function maps 1:1 to a named spec in the event model diagram.
 */

// Credit ratings below investment grade (BBB and above is investment grade)
const NON_INVESTMENT_GRADE_RATINGS = new Set(["BB", "BB+", "BB-", "B", "B+", "B-", "CCC", "CCC+", "CCC-", "CC", "C", "D"]);

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
  state.portfolioId !== "" && NON_INVESTMENT_GRADE_RATINGS.has(command.creditRating);

/**
 * spec: portfolioRatingMaintained
 * GIVEN state fields: portfolioId, acquisitionDate, borrowerName, creditRating, interestRate, loanAmount, loanId, maturityDate
 * WHEN command fields: portfolioId, acquisitionDate, borrowerName, creditRating, interestRate, loanAmount, loanId, maturityDate
 * THEN: LoanAddedToPortfolio
 */
export const portfolioRatingMaintained = (state: SliceStateAddLoanToPortfolioViewState, command: AddLoanToPortfolio): boolean =>
  state.portfolioId === "" || !NON_INVESTMENT_GRADE_RATINGS.has(command.creditRating);
