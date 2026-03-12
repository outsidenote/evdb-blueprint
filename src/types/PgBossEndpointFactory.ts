import { PgBoss } from "pg-boss";
import { Kafka } from "kafkajs";
import pg from "pg";
import { KafkaConsumerEndpointFactory } from "./KafkaConsumerEndpointFactory.js";

export interface PgBossEndpointContext {
  readonly outboxId: string;
}

/**
 * Checks the outbox table for an existing idempotency marker.
 */
async function isAlreadyProcessed(pool: pg.Pool | pg.PoolClient, idempotencyKey: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM public.outbox WHERE channel = 'idempotent' AND payload->>'idempotencyKey' = $1 LIMIT 1`,
    [idempotencyKey],
  );
  return rows.length > 0;
}

/**
 * Writes an idempotency marker to the outbox table.
 */
async function markProcessed(
  pool: pg.Pool | pg.PoolClient,
  idempotencyKey: string,
  queueName: string,
  handlerName: string,
): Promise<void> {
  const messageType = `${handlerName}.IdempotencyKeyAddedForConsumer`;
  await pool.query(
    `INSERT INTO public.outbox
      (id, stream_type, stream_id, "offset", event_type, channel, message_type, serialize_type, captured_by, captured_at, payload)
     VALUES (gen_random_uuid(), 'idempotent', $1, 0, 'IdempotencyKeyAddedForConsumer', 'idempotent', $2, 'json', $3, NOW(), $4)`,
    [idempotencyKey, messageType, queueName, JSON.stringify({ idempotencyKey })],
  );
}

/**
 * Delivery source determines how jobs arrive in the pg-boss queue:
 *
 * - "event": internal automation — the outbox SQL trigger inserts jobs
 *   directly into pgboss.job within the same transaction as the outbox INSERT.
 *   Used for same-context event reactions (e.g., FundsWithdrawalApproved → CalculateWithdrawCommission).
 *
 * - "message": cross-boundary automation — CDC/Debezium publishes to Kafka,
 *   then KafkaConsumerEndpointFactory bridges messages into pg-boss via boss.send().
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

  constructor(config: {
    eventType: string;
    handlerName: string;
    source: PgBossDeliverySource;
    kafkaTopic?: string;
    handler: (payload: TPayload, context: PgBossEndpointContext) => Promise<void>;
  }) {
    this.eventType = config.eventType;
    this.handlerName = config.handlerName;
    this.source = config.source;
    this.kafkaTopic = config.kafkaTopic;
    this.handler = config.handler;
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
 * channel = 'idempotent' and a composite key of `outboxId:queueName`.
 * If found, the job is skipped. After the handler returns successfully,
 * the factory writes the idempotency marker to the outbox automatically.
 *
 * Note: the handler and the marker write are NOT in the same transaction.
 * If the process crashes after the handler succeeds but before the marker
 * is written, the job will be retried and the handler will run again.
 * Handlers must therefore be idempotent themselves (e.g. via optimistic
 * concurrency in the event store) to tolerate this edge case.
 *
 * On restart: nothing to catch up — jobs already exist in pgboss.job.
 * boss.work() resumes processing any pending/failed jobs automatically.
 *
 * See: infrastructure/outbox-trigger.sql for the trigger definition.
 */
export class PgBossEndpointFactory {
  private kafkaConsumers?: KafkaConsumerEndpointFactory;

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
        const idempotencyKey = `${outboxId}:${queueName}`;

        if (config.source === "message") {
          // Message-sourced endpoints (Kafka) need an advisory lock because
          // Kafka's at-least-once delivery can enqueue duplicate pg-boss jobs
          // with the same outboxId, which may be picked up concurrently.
          // Uses two-key form: (hash(outboxId), hash(queueName)) to minimize
          // collision risk vs a single 32-bit hash of the composite key.
          const client = await pool.connect();
          try {
            const { rows: [{ acquired }] } = await client.query<{ acquired: boolean }>(
              `SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS acquired`,
              [outboxId, queueName],
            );

            if (!acquired) {
              console.log(`[PgBossEndpoint] Lock contention for ${idempotencyKey}, skipping (pg-boss will retry)`);
              throw new Error(`Lock contention for ${idempotencyKey}`);
            }

            try {
              if (await isAlreadyProcessed(client, idempotencyKey)) {
                console.log(`[PgBossEndpoint] Duplicate detected for ${idempotencyKey}, skipping`);
                return;
              }

              await config.handler(data.payload, { outboxId });
              await markProcessed(client, idempotencyKey, queueName, config.handlerName);
            } finally {
              await client.query(`SELECT pg_advisory_unlock(hashtext($1), hashtext($2))`, [outboxId, queueName]);
            }
          } finally {
            client.release();
          }
        } else {
          // Trigger-based endpoints avoid duplicate job creation for the same
          // outbox row, so concurrent duplication is unlikely. However, retries
          // after worker failure can still occur, so idempotent handling is
          // still required — just without the advisory lock.
          if (await isAlreadyProcessed(pool, idempotencyKey)) {
            console.log(`[PgBossEndpoint] Duplicate detected for ${idempotencyKey}, skipping`);
            return;
          }

          await config.handler(data.payload, { outboxId });
          await markProcessed(pool, idempotencyKey, queueName, config.handlerName);
        }
      });

      console.log(`[PgBossEndpoint] Registered ${config.handlerName} for ${config.eventType}`);
    }

    // Auto-wire Kafka consumers for endpoints that declare a kafkaTopic
    const kafkaEndpoints = endpoints.filter(e => e.kafkaTopic);
    if (kafkaEndpoints.length > 0) {
      if (!kafka) {
        throw new Error(
          `[PgBossEndpointFactory] ${kafkaEndpoints.length} endpoint(s) declare a kafkaTopic ` +
          `but no Kafka instance was provided to startAll()`,
        );
      }

      console.log(`[PgBossEndpointFactory] Starting Kafka consumers for ${kafkaEndpoints.length} endpoint(s)`);
      factory.kafkaConsumers = await KafkaConsumerEndpointFactory.startAll(kafka, boss,
        kafkaEndpoints.map(e => ({
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
