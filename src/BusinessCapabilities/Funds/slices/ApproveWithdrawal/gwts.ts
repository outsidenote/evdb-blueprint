import type { ApproveWithdrawal } from "./command.js";

/**
 * Named spec predicates derived from the event model's GWT specifications.
 * Each function maps 1:1 to a named spec in the event model diagram.
 */

/**
 * spec: Insufficient Effective Funds Withdrawals
 *
 * WHEN: ApproveWithdrawal where currentBalance < amount
 * THEN: FundsWithdrawalDeclined
 */
export const hasInsufficientEffectiveFunds = (balance: number, command: ApproveWithdrawal): boolean =>
  balance < command.amount;
