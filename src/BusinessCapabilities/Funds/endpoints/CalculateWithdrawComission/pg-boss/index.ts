import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import { type PgBossEndpointConfig, pgBossQueueName } from "../../../../../types/PgBossEndpointFactory.js";
import { createCalculateWithdrawCommissionAdapter } from "../../../slices/CalculateWithdrawCommissionAdapter/adapter.js";
import { CalculateWithdrawCommissionCommand } from "../../../slices/CalculateWithdrawCommissionAdapter/command.js";

export const QUEUE_NAME = pgBossQueueName("FundsWithdrawalApproved", "CalculateWithdrawCommission");

interface FundsWithdrawalApprovedPayload {
  readonly account: string;
  readonly amount: number;
  readonly currency: string;
}

/**
 * pg-boss endpoint for the CalculateWithdrawCommission slice.
 *
 * Follows the same flow as a REST endpoint:
 *   receive input → enrich → create command → call adapter.
 *
 * The slice doesn't know if it was triggered by REST or a queue —
 * it just receives a command.
 *
 * Listens for FundsWithdrawalApproved events in the outbox,
 * enriches them (calculates commission), and executes the
 * CalculateWithdrawCommission command.
 *
 * Idempotent: uses the outbox row ID as the transactionId so
 * re-deliveries produce the same command and the orchestrator
 * can detect duplicates via optimistic concurrency.
 */
export function createFundsWithdrawalApprovedWorker(
  storageAdapter: IEvDbStorageAdapter,
): PgBossEndpointConfig<FundsWithdrawalApprovedPayload> {
  const calculateCommission = createCalculateWithdrawCommissionAdapter(storageAdapter);

  return {
    eventType: "FundsWithdrawalApproved",
    handlerName: "CalculateWithdrawCommission",

    handler: async (payload, { outboxId }) => {
      const commission = payload.amount * 0.01;

      const command = new CalculateWithdrawCommissionCommand({
        account: payload.account,
        amount: payload.amount,
        commission,
        currency: payload.currency,
        session: "worker",
        source: "outbox",
        transactionId: outboxId,
        transactionTime: new Date(),
      });

      const result = await calculateCommission(command);

      if (result.events.length === 0) {
        console.log(`[OutboxWorker] FundsWithdrawalApproved already processed (${outboxId}), skipping`);
        return;
      }

      console.log(
        `[OutboxWorker] FundsWithdrawalApproved → commission=${commission} ` +
        `account=${payload.account} events=[${result.events.map(e => e.payload.payloadType).join(", ")}]`,
      );
    },
  };
}
