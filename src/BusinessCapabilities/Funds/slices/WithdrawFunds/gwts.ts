import type { WithdrawFunds } from "./command.js";

/**
 * Named spec predicates derived from the event model's GWT specifications.
 * Each function maps 1:1 to a named spec in the event model diagram.
 */

/**
 * spec: Insufficient Balance for Withdrawal
 *
 * WHEN: WithdrawFunds where currentBalance < amount
 * THEN: FundsWithdrawDeclined
 */
export const hasInsufficientBalance = (balance: number, command: WithdrawFunds): boolean =>
  balance < command.amount + command.commission;
// 1 === 2;

