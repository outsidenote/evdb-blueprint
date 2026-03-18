import type { ApproveWithdrawal } from "./command.js";
import { FundsWithdrawalApproved } from "../../swimlanes/Funds/events/FundsWithdrawalApproved/event.js";
import { FundsWithdrawalDeclined } from "../../swimlanes/Funds/events/FundsWithdrawalDeclined/event.js";
import type { ApproveWithdrawalStream } from "./streamContract.js";
import { hasInsufficientEffectiveFunds } from "./gwts.js";

/**
 * Pure command handler for the ApproveWithdrawal command.
 *
 * Decision logic driven by named spec predicates from the event model:
 * - hasInsufficientEffectiveFunds → appendEvent FundsWithdrawalDeclined
 * - otherwise                     → appendEvent FundsWithdrawalApproved
 *
 * This function only appends events to the stream. It does NOT fetch,
 * store, or return anything — orchestration belongs to the CommandAdapter.
 */
export const handleApproveWithdrawal = (stream: ApproveWithdrawalStream, command: ApproveWithdrawal) => {
  const { balance } = stream.views.SliceStateApproveWithdrawal;
  if (hasInsufficientEffectiveFunds(balance, command)) {
    stream.appendEventFundsWithdrawalDeclined(
      new FundsWithdrawalDeclined({
        account: command.account,
        session: command.session,
        currency: command.currency,
        amount: command.amount,
        reason: `Insufficient funds: balance ${balance} is less than withdrawal amount ${command.amount}`,
        payer: command.payer,
        source: command.source,
        transactionId: command.transactionId,
      }),
    );
  } else {
    stream.appendEventFundsWithdrawalApproved(
      new FundsWithdrawalApproved({
        account: command.account,
        amount: command.amount,
        currency: command.currency,
        session: command.session,
        source: command.source,
        payer: command.payer,
        transactionId: command.transactionId,
      }),
    );
  }
};
