/**
 * Named spec predicates derived from the event model's GWT specifications.
 * Each function maps 1:1 to a named spec in the event model diagram.
 */

import { IApproveWithdrawalCommand } from "./command.js";

/**
 * spec: Insufficient Effective Funds Withdrawals
 *
 * WHEN: ApproveWithdrawal where currentBalance < amount
 * THEN: FundsWithdrawalDeclined
 */
export const hasInsufficientEffectiveFunds = (command: IApproveWithdrawalCommand): boolean =>
  command.currentBalance < command.amount;

/**
 * spec: Sufficient Funds Withdrawal Approval
 *
 * WHEN: IApproveWithdrawalCommand where currentBalance >= amount
 * THEN: FundsWithdrawalApproved
 */
export const hasSufficientFunds = (command: IApproveWithdrawalCommand): boolean =>
  command.currentBalance >= command.amount;
