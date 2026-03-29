import type { CommandHandler } from "#abstractions/commands/commandHandler.js";
import type { ApproveWithdrawal } from "./command.js";
import type { FundsStreamType } from "#BusinessCapabilities/Funds/swimlanes/Funds/index.js";
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
export const handleApproveWithdrawal: CommandHandler<
  FundsStreamType,
  ApproveWithdrawal
> = (stream, command) => {
  const { balance } = stream.views.SliceStateApproveWithdrawal;
  if (hasInsufficientEffectiveFunds(balance, command)) {
    stream.appendEventFundsWithdrawalDeclined({
      account: command.account,
      session: command.session,
      currency: command.currency,
      amount: command.amount,
      reason: `Insufficient funds: balance ${balance} is less than withdrawal amount ${command.amount}`,
      payer: command.payer,
      source: command.source,
      transactionId: command.transactionId,
    });
  } else {
    stream.appendEventFundsWithdrawalApproved({
      account: command.account,
      amount: command.amount,
      currency: command.currency,
      session: command.session,
      source: command.source,
      payer: command.payer,
      transactionId: command.transactionId,
    });
  }
};
