import type { CommandHandler } from "../../../../types/commandHandler.js";
import type { CalculateWithdrawCommissionCommand } from "./command.js";
import type { FundsStreamType } from "../../swimlanes/Funds/index.js";
import { WithdrawCommissionCalculated } from "../../swimlanes/Funds/events/WithdrawCommissionCalculated.js";

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
export const handleCalculateWithdrawCommission: CommandHandler<
  FundsStreamType,
  CalculateWithdrawCommissionCommand
> = (stream, command) => {
  console.log(`Calculating withdraw commission for account ${command.account} and amount ${command.amount}...`);
  stream.appendEventWithdrawCommissionCalculated(
    new WithdrawCommissionCalculated(command)
  );
};
