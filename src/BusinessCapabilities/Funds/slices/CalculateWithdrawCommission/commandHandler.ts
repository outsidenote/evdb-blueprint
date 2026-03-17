import type { CommandHandler } from "../../../../types/commandHandler.js";
import type { CalculateWithdrawCommissionCommand } from "./command.js";
import type { FundsStreamType } from "../../swimlanes/Funds/index.js";
import { WithdrawCommissionCalculated } from "../../swimlanes/Funds/events/WithdrawCommissionCalculated/event.js";

/**
 * Pure command handler for the CalculateWithdrawCommission command.
 *
 * Idempotency is handled at the PgBossEndpointFactory level via
 * outbox-based deduplication (channel = 'idempotent', key = outboxId:queueName).
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
