import type { CommandHandler } from "../../../../types/commandHandler.js";
import type { CalculateWithdrawCommissionCommand } from "./command.js";
import type { FundsStreamType } from "../../swimlanes/Funds/index.js";
import { WithdrawCommissionCalculated } from "../../swimlanes/Funds/events/WithdrawCommissionCalculated.js";
import { isAlreadyProcessed } from "./gwts.js";

/**
 * Pure command handler for the CalculateWithdrawCommission command.
 *
 * Decision logic driven by named spec predicates from the event model:
 * - isAlreadyProcessed → no-op (idempotent skip)
 * - otherwise          → appendEvent WithdrawCommissionCalculated
 *
 * This function only appends events to the stream. It does NOT fetch,
 * store, or return anything — orchestration belongs to the CommandAdapter.
 */
export const handleCalculateWithdrawCommission: CommandHandler<
  FundsStreamType,
  CalculateWithdrawCommissionCommand
> = (stream, command) => {
  const { processedTransactionIds } = stream.views.SliceStateCalculateWithdrawCommission.state;
  if (isAlreadyProcessed(processedTransactionIds, command.transactionId)) {
    console.log(`Commission already calculated for transactionId ${command.transactionId}, skipping`);
    return;
  }
  console.log(`Calculating withdraw commission for account ${command.account} and amount ${command.amount}...`);
  stream.appendEventWithdrawCommissionCalculated(
    new WithdrawCommissionCalculated(command)
  );
};
