import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { PgBossEndpointIdentity } from "../../../../../types/abstractions/endpoints/PgBossEndpointIdentity.js";
import { createEndpointConfig, type PgBossEndpointConfigBase } from "../../../../../types/abstractions/endpoints/PgBossEndpointConfig.js";
import { createRecordFundWithdrawActionAdapter } from "../../../slices/RecordFundWithdrawAction/adapter.js";
import { getIdempotencyKey } from "../../../../../types/abstractions/endpoints/idempotencyMessage.js";

export const endpointIdentity: PgBossEndpointIdentity = {
  source: "message",
  eventType: "FundsWithdrawn",
  handlerName: "RecordFundWithdrawAction",
} as const;

interface FundsWithdrawnPayload {
  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
  readonly transactionId: string;
}

/**
 * pg-boss endpoint for the RecordFundWithdrawAction slice.
 *
 * Follows the same flow as a REST endpoint:
 *   receive input -> create command -> call adapter.
 *
 * Listens for FundsWithdrawn events in the outbox
 * and executes the RecordFundWithdrawAction command.
 *
 * Idempotent: uses the outbox row ID as a deduplication key so
 * re-deliveries produce the same command and the orchestrator
 * can detect duplicates via optimistic concurrency.
 */
export function createFundsWithdrawnWorker(
  storageAdapter: IEvDbStorageAdapter,
): PgBossEndpointConfigBase {
  const recordFundWithdrawAction = createRecordFundWithdrawActionAdapter(storageAdapter);

  return createEndpointConfig<FundsWithdrawnPayload>({
    ...endpointIdentity,
    kafkaTopic: "events.FundsWithdrawn",

    getIdempotencyKey: (payload, _context) =>
      getIdempotencyKey(payload.transactionId, "RecordFundWithdrawAction"),

    handler: async (payload) => {
      const command = {
        commandType: "RecordFundWithdrawAction" as const,
        account: payload.account,
        amount: payload.amount + payload.commission,
        currency: payload.currency,
        transactionId: payload.transactionId,
      };

      const result = await recordFundWithdrawAction(command);

      console.log(
        `[OutboxWorker] FundsWithdrawn → RecordFundWithdrawAction ` +
        `account=${payload.account} events=[${result.events.map(e => e.eventType).join(", ")}]`,
      );
    },
  });
}
