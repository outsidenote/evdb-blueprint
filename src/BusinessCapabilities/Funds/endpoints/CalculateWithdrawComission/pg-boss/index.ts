import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import { PgBossEndpointConfig } from "../../../../../types/PgBossEndpointFactory.js";
import { createCalculateWithdrawCommissionAdapter } from "../../../slices/CalculateWithdrawCommissionAdapter/adapter.js";
import { enrich } from "../enrichment.js";

export const CHANNEL = "pg-boss" as const;
export const QUEUE_NAME = "outbox.FundsWithdrawalApproved.CalculateWithdrawCommission";

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

  return new PgBossEndpointConfig({
    eventType: "FundsWithdrawalApproved",
    handlerName: "CalculateWithdrawCommission",

    handler: async (payload, { outboxId }) => {
      const command = enrich({
        account: payload.account,
        amount: payload.amount,
        currency: payload.currency,
        session: "worker",
        source: "outbox",
        payer: "unknown",
        approvalDate: new Date(),
        transactionId: outboxId,
        transactionTime: new Date(),
      });

      const result = await calculateCommission(command);

      console.log(
        `[OutboxWorker] FundsWithdrawalApproved → commission=${command.commission} ` +
        `account=${payload.account} events=[${result.events.map(e => e.payload.payloadType).join(", ")}]`,
      );
    },
  });
}
