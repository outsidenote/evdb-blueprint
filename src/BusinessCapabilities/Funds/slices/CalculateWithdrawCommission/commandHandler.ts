import type { CommandHandler } from "#abstractions/commands/commandHandler.js";
import type { CalculateWithdrawCommissionCommand } from "./command.js";
import type { FundsStreamType } from "#BusinessCapabilities/Funds/swimlanes/Funds/index.js";

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
  stream.appendEventWithdrawCommissionCalculated({
    account: command.account,
    amount: command.amount,
    commission: command.commission,
    currency: command.currency,
    session: command.session,
    source: command.source,
    transactionId: command.transactionId,
    transactionTime: command.transactionTime,
  });
};
