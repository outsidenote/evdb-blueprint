import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import { type PgBossEndpointConfig, pgBossQueueName } from "../../../../../types/PgBossEndpointFactory.js";
import { createWithdrawFundsAdapter } from "../../../slices/WithdrawFunds/adapter.js";
import { WithdrawFunds } from "../../../slices/WithdrawFunds/command.js";

export const CHANNEL = "pg-boss" as const;
export const QUEUE_NAME = pgBossQueueName({ eventType: "WithdrawCommissionCalculated", handlerName: "WithdrawFunds" } as PgBossEndpointConfig);

interface WithdrawCommissionCalculatedPayload {
  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
}

/**
 * pg-boss endpoint for the WithdrawFunds slice (Withdraw Funds Processor).
 *
 * Follows the same flow as a REST endpoint:
 *   receive input → create command → call adapter.
 *
 * Listens for WithdrawCommissionCalculated events in the outbox
 * and executes the WithdrawFunds command.
 *
 * Idempotent: uses the outbox row ID as a deduplication key so
 * re-deliveries produce the same command and the orchestrator
 * can detect duplicates via optimistic concurrency.
 */
export function createWithdrawCommissionCalculatedWorker(
  storageAdapter: IEvDbStorageAdapter,
): PgBossEndpointConfig<WithdrawCommissionCalculatedPayload> {
  const withdrawFunds = createWithdrawFundsAdapter(storageAdapter);

  return {
    eventType: "WithdrawCommissionCalculated",
    handlerName: "WithdrawFunds",

    handler: async (payload, { outboxId }) => {
      const command = new WithdrawFunds({
        account: payload.account,
        amount: payload.amount,
        commission: payload.commission,
        currency: payload.currency,
        session: outboxId,
      });

      const result = await withdrawFunds(command);

      console.log(
        `[OutboxWorker] WithdrawCommissionCalculated → WithdrawFunds ` +
        `account=${payload.account} events=[${result.events.map(e => e.payload.payloadType).join(", ")}]`,
      );
    },
  };
}
