import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { PgBossEndpointIdentity, PgBossDeliverySource } from "./PgBossEndpointIdentity.js";
import { createEndpointConfig, type PgBossEndpointConfigBase } from "./PgBossEndpointConfig.js";
import type { CommandHandlerOrchestratorResult } from "../commands/commandHandler.js";

/**
 * Configuration for an automation endpoint that bridges an event/message
 * to a command slice via pg-boss.
 *
 * @typeParam TPayload - Shape of the incoming message payload (from outbox or Kafka).
 * @typeParam TCommand - Shape of the domain command the slice expects.
 *
 * @property source      - Delivery mechanism:
 *                          "event"   = same-capability, outbox SQL trigger inserts pg-boss job
 *                                      transactionally with the event.
 *                          "message" = cross-capability, Kafka CDC bridges into pg-boss.
 * @property eventType   - The event that triggers this endpoint (e.g. "FundsWithdrawalApproved").
 * @property handlerName - The command slice this endpoint executes (e.g. "CalculateWithdrawCommission").
 *                          Combined with source + eventType to derive the pg-boss queue name:
 *                          `${source}.${eventType}.${handlerName}`.
 * @property kafkaTopic  - Required when source is "message". The Kafka topic to consume from.
 * @property createAdapter - Factory that builds the command orchestrator.
 *                            Receives storageAdapter (injected at startup), returns a function
 *                            that accepts a command and persists events to the stream.
 * @property mapPayloadToCommand - Pure function that transforms the incoming payload into
 *                                  the domain command. This is where enrichment happens
 *                                  (e.g. computing commission, defaulting fields).
 * @property getIdempotencyKey   - Extracts a natural business key from the payload
 *                                  (typically transactionId). The framework appends
 *                                  `:${handlerName}` automatically, so the same transactionId
 *                                  can be processed by different handlers without collision.
 */
interface AutomationEndpointDefinition<TPayload, TCommand> {
  readonly source: PgBossDeliverySource;
  readonly eventType: string;
  readonly handlerName: string;
  readonly kafkaTopic?: string;
  readonly createAdapter: (storageAdapter: IEvDbStorageAdapter) => (command: TCommand) => Promise<CommandHandlerOrchestratorResult>;
  readonly mapPayloadToCommand: (payload: TPayload) => TCommand;
  readonly getIdempotencyKey: (payload: TPayload) => string;
}

/**
 * Return type of {@link defineAutomationEndpoint}.
 *
 * @property endpointIdentity - The identity (source, eventType, handlerName) used to
 *                               derive the queue name via `buildQueueName(identity)`.
 *                               Exported by the endpoint file so that message producers
 *                               can import it to route outbox jobs to the correct queue.
 * @property create           - Factory function called at startup in server.ts.
 *                               Receives the storageAdapter and returns a fully wired
 *                               PgBossEndpointConfig ready for `PgBossEndpointFactory.startAll()`.
 */
interface AutomationEndpoint {
  readonly endpointIdentity: PgBossEndpointIdentity;
  readonly create: (storageAdapter: IEvDbStorageAdapter) => PgBossEndpointConfigBase;
}

/**
 * Declarative builder for automation endpoints that bridge events/messages to command slices.
 *
 * Encapsulates the boilerplate of wiring a pg-boss worker:
 * - Derives the queue name from `source.eventType.handlerName`
 * - Composes the idempotency key as `businessKey:handlerName`
 * - Logs every execution with event type, handler, key, and emitted events
 * - Injects the storage adapter at startup (never a module-level singleton)
 *
 * @example
 * ```typescript
 * // Same-capability (outbox trigger → pg-boss):
 * const worker = defineAutomationEndpoint({
 *   source: "event",
 *   eventType: "FundsWithdrawalApproved",
 *   handlerName: "CalculateWithdrawCommission",
 *   createAdapter: createCalculateWithdrawCommissionAdapter,
 *   getIdempotencyKey: (p) => p.transactionId,
 *   mapPayloadToCommand: (p) => enrich({ ...p }),
 * });
 *
 * // Cross-capability (Kafka CDC → pg-boss):
 * const worker = defineAutomationEndpoint({
 *   source: "message",
 *   eventType: "FundsWithdrawn",
 *   handlerName: "RecordFundWithdrawAction",
 *   kafkaTopic: "events.FundsWithdrawn",
 *   createAdapter: createRecordFundWithdrawActionAdapter,
 *   getIdempotencyKey: (p) => p.transactionId,
 *   mapPayloadToCommand: (p) => ({ commandType: "RecordFundWithdrawAction" as const, ...p }),
 * });
 *
 * // Export for use:
 * export const endpointIdentity = worker.endpointIdentity;  // messages import this
 * export const createWorker = worker.create;                 // server.ts calls this
 * ```
 */
export function defineAutomationEndpoint<TPayload, TCommand>(
  definition: AutomationEndpointDefinition<TPayload, TCommand>,
): AutomationEndpoint {
  const endpointIdentity: PgBossEndpointIdentity = {
    source: definition.source,
    eventType: definition.eventType,
    handlerName: definition.handlerName,
  };

  return {
    endpointIdentity,

    create(storageAdapter: IEvDbStorageAdapter): PgBossEndpointConfigBase {
      const adapter = definition.createAdapter(storageAdapter);

      return createEndpointConfig<TPayload>({
        ...endpointIdentity,
        kafkaTopic: definition.kafkaTopic,

        getIdempotencyKey: (payload, _context) =>
          `${definition.getIdempotencyKey(payload)}:${definition.handlerName}`,

        handler: async (payload) => {
          const command = definition.mapPayloadToCommand(payload);
          const result = await adapter(command);

          console.log(
            `[OutboxWorker] ${definition.eventType} → ${definition.handlerName} ` +
            `key=${definition.getIdempotencyKey(payload)} events=[${result.events.map((e: { eventType: string }) => e.eventType).join(", ")}]`,
          );
        },
      });
    },
  };
}
