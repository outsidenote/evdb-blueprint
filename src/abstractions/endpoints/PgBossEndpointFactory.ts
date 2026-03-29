import type { PgBoss } from "pg-boss";
import type { Kafka } from "kafkajs";
import { AutomationEndpointFactory } from "./AutomationEndpointFactory.js";
import type { PgBossEndpointConfigBase, PgBossEndpointContext } from "./PgBossEndpointConfig.js";
import type { IdempotencyGate } from "./IdempotencyGate.js";

interface JobData {
  metadata: {
    outboxId: string;
  };
  payload: Record<string, unknown>;
}

/**
 * Generic pg-boss endpoint factory.
 *
 * Mirrors the CommandHandlerOrchestratorFactory pattern:
 *   - This factory is the generic infrastructure
 *   - Each slice provides a PgBossEndpointConfigBase (via its pg-boss endpoint)
 *   - server.ts registers all configs in one call
 *
 * Delivery: a Postgres trigger on the outbox table inserts directly into
 * pgboss.job within the same transaction as the outbox INSERT. This gives
 * exactly-once semantics — either both the outbox row and the pg-boss job
 * exist, or neither does.
 *
 * Fan-out: the message producer defines target queues in the outbox payload.
 * The trigger reads the queues array and inserts one job per queue.
 * Each queue is independent (separate retries, dead letter).
 *
 * Idempotency: the factory gates every job with an injectable IdempotencyGate.
 * Before calling the handler, it checks whether the key has already been processed.
 * If so, the job is skipped.
 *
 * The idempotency marker itself is written atomically with the events
 * by the stream's message handler (GWT messaging config) — NOT by this
 * factory. This ensures the marker and events are in the same transaction.
 *
 * On restart: nothing to catch up — jobs already exist in pgboss.job.
 * boss.work() resumes processing any pending/failed jobs automatically.
 *
 * See: infrastructure/outbox-trigger.sql for the trigger definition.
 */
export class PgBossEndpointFactory {
  private kafkaConsumers?: AutomationEndpointFactory;

  /**
   * Registers all pg-boss workers and, for any config with a `kafkaTopic`,
   * automatically starts a Kafka consumer that bridges messages into pg-boss.
   *
   * Pass a `kafka` instance if any endpoint has `source: "message"` with a `kafkaTopic`.
   */
  static async startAll(
    boss: PgBoss,
    endpoints: PgBossEndpointConfigBase[],
    idempotencyGate: IdempotencyGate,
    kafka?: Kafka,
  ): Promise<PgBossEndpointFactory> {
    const factory = new PgBossEndpointFactory();

    for (const config of endpoints) {
      const { queueName } = config;

      await boss.createQueue(queueName);

      await boss.work(queueName, async ([job]) => {
        const data = job.data as JobData;
        const { outboxId } = data.metadata;
        const context: PgBossEndpointContext = { outboxId };

        if (config.getIdempotencyKey) {
          const idempotencyKey = config.getIdempotencyKey(data.payload, context);
          if (await idempotencyGate.isAlreadyProcessed(idempotencyKey)) {
            console.log(`[PgBossEndpoint] Duplicate detected for ${idempotencyKey}, skipping`);
            return;
          }
        }

        await config.handler(data.payload, context);
      });

      console.log(`[PgBossEndpoint] Registered ${config.handlerName} for ${config.messageType}`);
    }

    // Auto-wire Kafka consumers for endpoints that declare a kafkaTopic
    const kafkaEndpoints = endpoints.filter((e) => e.kafkaTopic);
    if (kafkaEndpoints.length > 0) {
      if (!kafka) {
        throw new Error(
          `[PgBossEndpointFactory] ${kafkaEndpoints.length} endpoint(s) declare a kafkaTopic ` +
            `but no Kafka instance was provided to startAll()`,
        );
      }

      console.log(
        `[PgBossEndpointFactory] Starting Kafka consumers for ${kafkaEndpoints.length} endpoint(s)`,
      );
      factory.kafkaConsumers = await AutomationEndpointFactory.startAll(
        kafka,
        boss,
        kafkaEndpoints.map((e) => ({
          topic: e.kafkaTopic!,
          pgBossEndpoint: e,
        })),
      );
    }

    return factory;
  }

  async stop(): Promise<void> {
    await this.kafkaConsumers?.stop();
  }
}
