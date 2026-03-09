import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import { PgBossEndpointConfig } from "../../../../../types/PgBossEndpointFactory.js";
import { createRecordFundWithdrawActionAdapter } from "../../../slices/RecordFundWithdrawAction/adapter.js";
import { RecordFundWithdrawAction } from "../../../slices/RecordFundWithdrawAction/command.js";

export const CHANNEL = "pg-boss" as const;
export const QUEUE_NAME = "message.FundsWithdrawn.RecordFundWithdrawAction";

interface FundsWithdrawnPayload {
  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
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
): PgBossEndpointConfig<FundsWithdrawnPayload> {
  const recordFundWithdrawAction = createRecordFundWithdrawActionAdapter(storageAdapter);

  return new PgBossEndpointConfig({
    eventType: "FundsWithdrawn",
    handlerName: "RecordFundWithdrawAction",
    source: "message",
    kafkaTopic: "events.FundsWithdrawn",

    handler: async (payload, { outboxId }) => {
      const command = new RecordFundWithdrawAction({
        account: payload.account,
        amount: payload.amount + payload.commission,
        currency: payload.currency,
        session: outboxId,
      });

      const result = await recordFundWithdrawAction(command);

      console.log(
        `[OutboxWorker] FundsWithdrawn → RecordFundWithdrawAction ` +
        `account=${payload.account} events=[${result.events.map(e => e.payload.payloadType).join(", ")}]`,
      );
    },
  });
}
