import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { PgBossEndpointIdentity } from "../../../../../types/abstractions/endpoints/PgBossEndpointIdentity.js";
import { createEndpointConfig, type PgBossEndpointConfigBase } from "../../../../../types/abstractions/endpoints/PgBossEndpointConfig.js";
import { createWithdrawFundsAdapter } from "../../../slices/WithdrawFunds/adapter.js";
import { getIdempotencyKey } from "../../../../../types/abstractions/endpoints/idempotencyMessage.js";

export const endpointIdentity: PgBossEndpointIdentity = {
  source: "event",
  eventType: "WithdrawCommissionCalculated",
  handlerName: "WithdrawFunds",
} as const;

interface WithdrawCommissionCalculatedPayload {
  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
  readonly transactionId: string;
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
): PgBossEndpointConfigBase {
  const withdrawFunds = createWithdrawFundsAdapter(storageAdapter);

  return createEndpointConfig<WithdrawCommissionCalculatedPayload>({
    ...endpointIdentity,

    getIdempotencyKey: (payload, _context) =>
      getIdempotencyKey(payload.transactionId, "WithdrawFunds"),

    handler: async (payload) => {
      const command = {
        commandType: "WithdrawFunds" as const,
        account: payload.account,
        amount: payload.amount,
        commission: payload.commission,
        currency: payload.currency,
        transactionId: payload.transactionId,
      };

      const result = await withdrawFunds(command);

      console.log(
        `[OutboxWorker] WithdrawCommissionCalculated → WithdrawFunds ` +
        `account=${payload.account} events=[${result.events.map(e => e.payload.payloadType).join(", ")}]`,
      );
    },
  });
}
