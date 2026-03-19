import type { PgBoss } from "pg-boss";
import type { Kafka } from "kafkajs";
import type pg from "pg";
import { AutomationEndpointFactory } from "./AutomationEndpointFactory.js";

export interface PgBossEndpointContext {
  readonly outboxId: string;
}

/**
 * Checks the outbox table for an existing idempotency marker.
 *
 * The marker is written atomically with the events by the stream's
 * message handler — not by this factory. This function is the gate only.
 */
async function isAlreadyProcessed(pool: pg.Pool, idempotencyKey: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM public.outbox WHERE channel = 'idempotent' AND payload->>'idempotencyKey' = $1 LIMIT 1`,
    [idempotencyKey],
  );
  return rows.length > 0;
}

/**
 * Delivery source determines how jobs arrive in the pg-boss queue:
 *
 * - "event": internal automation — the outbox SQL trigger inserts jobs
 *   directly into pgboss.job within the same transaction as the outbox INSERT.
 *   Used for same-context event reactions (e.g., FundsWithdrawalApproved → CalculateWithdrawCommission).
 *
 * - "message": cross-boundary automation — CDC/Debezium publishes to Kafka,
 *   then AutomationEndpointFactory bridges messages into pg-boss via boss.send().
 *   Used for cross-context event consumption (e.g., FundsWithdrawn → RecordFundWithdrawAction).
 *
 * The source is encoded in the queue name to prevent collisions when the same
 * event type is consumed by both an internal trigger handler and an external
 * Kafka consumer (e.g., FundsWithdrawn for a to-do list vs. external fraud analysis).
 */
export type PgBossDeliverySource = "event" | "message";

export class PgBossEndpointConfig<TPayload = Record<string, unknown>> {
  readonly eventType: string;
  readonly handlerName: string;
  readonly source: PgBossDeliverySource;
  readonly kafkaTopic?: string;
  readonly handler: (payload: TPayload, context: PgBossEndpointContext) => Promise<void>;
  readonly getIdempotencyKey: (message: TPayload, context: PgBossEndpointContext) => string;

  constructor(config: {
    eventType: string;
    handlerName: string;
    source: PgBossDeliverySource;
    kafkaTopic?: string;
    handler: (payload: TPayload, context: PgBossEndpointContext) => Promise<void>;
    getIdempotencyKey: (message: TPayload, context: PgBossEndpointContext) => string;
  }) {
    this.eventType = config.eventType;
    this.handlerName = config.handlerName;
    this.source = config.source;
    this.kafkaTopic = config.kafkaTopic;
    this.handler = config.handler;
    this.getIdempotencyKey = config.getIdempotencyKey;
  }

  get queueName(): string {
    return `${this.source}.${this.eventType}.${this.handlerName}`;
  }
}

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
 *   - Each slice provides a PgBossEndpointConfig (via its pg-boss endpoint)
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
 * Idempotency: the factory gates every job with an outbox-based check.
 * Before calling the handler, it queries the outbox table for a row with
 * channel = 'idempotent' and a composite key of `outboxId:consumerId`.
 * If found, the job is skipped.
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
    endpoints: PgBossEndpointConfig<any>[],
    pool: pg.Pool,
    kafka?: Kafka,
  ): Promise<PgBossEndpointFactory> {
    const factory = new PgBossEndpointFactory();

    for (const config of endpoints) {
      const queueName = config.queueName;

      await boss.createQueue(queueName);

      await boss.work(queueName, async ([job]) => {
        const data = job.data as JobData;
        const { outboxId } = data.metadata;
        const context: PgBossEndpointContext = { outboxId };
        const idempotencyKey = config.getIdempotencyKey(data.payload, context);

        if (await isAlreadyProcessed(pool, idempotencyKey)) {
          console.log(`[PgBossEndpoint] Duplicate detected for ${idempotencyKey}, skipping`);
          return;
        }

        await config.handler(data.payload, context);
      });

      console.log(`[PgBossEndpoint] Registered ${config.handlerName} for ${config.eventType}`);
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
