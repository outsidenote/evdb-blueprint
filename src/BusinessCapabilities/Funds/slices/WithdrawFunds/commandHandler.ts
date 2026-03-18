import type { WithdrawFunds } from "./command.js";
import { FundsWithdrawn } from "../../swimlanes/Funds/events/FundsWithdrawn/event.js";
import { FundsWithdrawDeclined } from "../../swimlanes/Funds/events/FundsWithdrawDeclined/event.js";
import type { WithdrawFundsStream } from "./streamContract.js";
import { hasInsufficientBalance } from "./gwts.js";

/**
 * Pure command handler for the WithdrawFunds command.
 *
 * Decision logic driven by named spec predicates from the event model:
 * - hasInsufficientBalance → appendEvent FundsWithdrawDeclined
 * - otherwise              → appendEvent FundsWithdrawn
 *
 * This function only appends events to the stream. It does NOT fetch,
 * store, or return anything — orchestration belongs to the CommandAdapter.
 */
export const handleWithdrawFunds = (stream: WithdrawFundsStream, command: WithdrawFunds) => {
  const { balance } = stream.views.AccountBalance;
  if (hasInsufficientBalance(balance, command)) {
    stream.appendEventFundsWithdrawDeclined(
      new FundsWithdrawDeclined({
        account: command.account,
        amount: command.amount,
        currency: command.currency,
        transactionId: command.transactionId,
        reason: `Insufficient funds: balance ${balance} is less than withdrawal amount ${command.amount}`,
      }),
    );
  } else {
    stream.appendEventFundsWithdrawn(
      new FundsWithdrawn({
        account: command.account,
        amount: command.amount,
        commission: command.commission,
        currency: command.currency,
        transactionId: command.transactionId,
      }),
    );
  }
};
