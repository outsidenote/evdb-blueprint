import type { CommandHandler } from "../../../../types/commandHandler.js";
import type { WithdrawFunds } from "./command.js";
import { FundsWithdrew } from "../../swimlanes/Funds/events/FundsWithdrew.js";
import { FundsWithdrawDeclined } from "../../swimlanes/Funds/events/FundsWithdrawDeclined.js";
import type { FundsStreamType } from "../../swimlanes/Funds/index.js";
import { hasInsufficientBalance } from "./gwts.js";

/**
 * Pure command handler for the WithdrawFunds command.
 *
 * Decision logic driven by named spec predicates from the event model:
 * - hasInsufficientBalance → appendEvent FundsWithdrawDeclined
 * - otherwise              → appendEvent FundsWithdrew
 *
 * This function only appends events to the stream. It does NOT fetch,
 * store, or return anything — orchestration belongs to the CommandAdapter.
 */
export const handleWithdrawFunds: CommandHandler<
  FundsStreamType,
  WithdrawFunds
> = (stream, command) => {
  const { balance } = stream.views.AccountBalance.state;
  if (hasInsufficientBalance(balance, command)) {
    stream.appendEventFundsWithdrawDeclined(
      new FundsWithdrawDeclined({
        account: command.account,
        amount: command.amount,
        currency: command.currency,
        session: command.session,
        reason: `Insufficient funds: balance ${balance} is less than withdrawal amount ${command.amount}`,
      }),
    );
  } else {
    stream.appendEventFundsWithdrew(
      new FundsWithdrew({
        account: command.account,
        amount: command.amount,
        commission: command.commission,
        currency: command.currency,
        session: command.session,
      }),
    );
  }
};
