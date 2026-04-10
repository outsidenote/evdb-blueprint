import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { PgBossEndpointIdentity, PgBossDeliverySource } from "./PgBossEndpointIdentity.js";
import { buildQueueName } from "./PgBossEndpointIdentity.js";
import { createEndpointConfig, type PgBossEndpointConfigBase } from "./PgBossEndpointConfig.js";
import type { CommandHandlerOrchestratorResult } from "../commands/commandHandler.js";

// ── Self-registration registry ──────────────────────────────────────
// Every call to defineAutomationEndpoint() automatically registers the
// endpoint. At startup, call discoverAutomations() to collect them all.

const registry: AutomationEndpoint[] = [];

/**
 * Returns all automation endpoints that were registered via defineAutomationEndpoint().
 * Modules must be imported (side-effect) before calling this.
 */
export function getRegisteredAutomations(): readonly AutomationEndpoint[] {
  return registry;
}

/**
 * Configuration for an automation endpoint that bridges a message
 * to a command slice via pg-boss.
 *
 * @typeParam TPayload - Shape of the incoming message payload (from outbox or Kafka).
 * @typeParam TCommand - Shape of the domain command the slice expects.
 *
 * @property source      - Delivery mechanism:
 *                          "event"   = same-capability, outbox SQL trigger inserts pg-boss job
 *                                      transactionally with the event.
 *                          "message" = cross-capability, Kafka CDC bridges into pg-boss.
 * @property messageType - The message that triggers this endpoint (e.g. "FundsWithdrawalApproved").
 * @property handlerName - The command slice this endpoint executes (e.g. "CalculateWithdrawCommission").
 *                          Combined with source + messageType to derive the pg-boss queue name:
 *                          `${source}.${messageType}.${handlerName}`.
 * @property kafkaTopic  - Required when source is "projection". The Kafka topic to consume from.
 * @property createAdapter - Factory that builds the command orchestrator.
 *                            Receives storageAdapter (injected at startup), returns a function
 *                            that accepts a command and persists events to the stream.
 * @property mapPayloadToCommand - Async function that transforms the incoming payload into
 *                                  the domain command. Supports enrichment logic that may
 *                                  fetch data from external services.
 * @property getIdempotencyKey   - Optional. Extracts a natural business key from the payload
 *                                  (typically transactionId). The framework appends
 *                                  `:${handlerName}` automatically. Omit for endpoints
 *                                  that don't require idempotency.
 */
interface AutomationEndpointDefinition<TPayload, TCommand> {
  readonly source: PgBossDeliverySource;
  readonly messageType: string;
  readonly handlerName: string;
  readonly kafkaTopic?: string;
  readonly createAdapter: (storageAdapter: IEvDbStorageAdapter) => (command: TCommand) => Promise<CommandHandlerOrchestratorResult>;
  readonly mapPayloadToCommand: (payload: TPayload) => TCommand | Promise<TCommand>;
  readonly getIdempotencyKey?: (payload: TPayload) => string;
}

/**
 * Return type of {@link defineAutomationEndpoint}.
 *
 * @property endpointIdentity - The identity (source, messageType, handlerName, queueName).
 *                               The queueName is computed once at definition time.
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
 * Declarative builder for automation endpoints that bridge messages to command slices.
 *
 * Encapsulates the boilerplate of wiring a pg-boss worker:
 * - Computes the queue name once as `source.messageType.handlerName`
 * - Optionally composes the idempotency key as `businessKey:handlerName`
 * - Logs every execution with message type, handler, key, and emitted events
 * - Injects the storage adapter at startup (never a module-level singleton)
 *
 * @example
 * ```typescript
 * // Same-capability (outbox trigger → pg-boss):
 * const worker = defineAutomationEndpoint({
 *   source: "event",
 *   messageType: "FundsWithdrawalApproved",
 *   handlerName: "CalculateWithdrawCommission",
 *   createAdapter: createCalculateWithdrawCommissionAdapter,
 *   getIdempotencyKey: (p) => p.transactionId,
 *   mapPayloadToCommand: (p) => enrich({ ...p }),
 * });
 *
 * // Cross-capability (Kafka CDC → pg-boss):
 * const worker = defineAutomationEndpoint({
 *   source: "message",
 *   messageType: "FundsWithdrawn",
 *   handlerName: "RecordFundWithdrawAction",
 *   kafkaTopic: "events.FundsWithdrawn",
 *   createAdapter: createRecordFundWithdrawActionAdapter,
 *   mapPayloadToCommand: async (p) => ({ commandType: "RecordFundWithdrawAction" as const, ...p }),
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
  const queueName = buildQueueName(definition.source, definition.messageType, definition.handlerName);

  const endpointIdentity: PgBossEndpointIdentity = {
    source: definition.source,
    messageType: definition.messageType,
    handlerName: definition.handlerName,
    queueName,
  };

  const endpoint: AutomationEndpoint = {
    endpointIdentity,

    create(storageAdapter: IEvDbStorageAdapter): PgBossEndpointConfigBase {
      const adapter = definition.createAdapter(storageAdapter);

      return createEndpointConfig<TPayload>({
        ...endpointIdentity,
        kafkaTopic: definition.kafkaTopic,

        getIdempotencyKey: definition.getIdempotencyKey
          ? (payload, _context) => `${definition.getIdempotencyKey!(payload)}:${definition.handlerName}`
          : undefined,

        handler: async (payload) => {
          const command = await definition.mapPayloadToCommand(payload);
          const result = await adapter(command);

          const key = definition.getIdempotencyKey?.(payload) ?? "n/a";
          console.log(
            `[OutboxWorker] ${definition.messageType} → ${definition.handlerName} ` +
            `key=${key} events=[${result.events.map((e: { eventType: string }) => e.eventType).join(", ")}]`,
          );
        },
      });
    },
  };

  registry.push(endpoint);
  return endpoint;
}
