import { Job, PgBoss } from "pg-boss";

export interface PgBossEndpointContext {
  readonly outboxId: string;
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
  readonly handler: (payload: TPayload, context: PgBossEndpointContext) => Promise<void>;

  constructor(config: {
    eventType: string;
    handlerName: string;
    source: PgBossDeliverySource;
    handler: (payload: TPayload, context: PgBossEndpointContext) => Promise<void>;
  }) {
    this.eventType = config.eventType;
    this.handlerName = config.handlerName;
    this.source = config.source;
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

const IDEMPOTENCY_SQL = `
  INSERT INTO public.processed_jobs (idempotency_key)
  VALUES ($1)
  ON CONFLICT DO NOTHING
  RETURNING idempotency_key
`;

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
 * Idempotency: before calling the handler, the factory inserts the outboxId
 * into the processed_jobs table. If the row already exists (redelivery),
 * the handler is skipped entirely.
 *
 * On restart: nothing to catch up — jobs already exist in pgboss.job.
 * boss.work() resumes processing any pending/failed jobs automatically.
 *
 * See: infrastructure/outbox-trigger.sql for the trigger definition.
 * See: infrastructure/processed-jobs.sql for the idempotency table.
 */
export class PgBossEndpointFactory {

  static async startAll(
    boss: PgBoss,
    endpoints: PgBossEndpointConfig<any>[],
  ): Promise<void> {
    const db = boss.getDb();

    for (const config of endpoints) {
      const queueName = config.queueName;

      await boss.createQueue(queueName);

      await boss.work(queueName, async ([job]) => {
        const isProcessed = async (outboxId: string) => {
          const { rows } = await db.executeSql(IDEMPOTENCY_SQL, [outboxId]);
          return rows.length === 0;
        }

        const data = job.data as JobData;
        const { outboxId } = data.metadata;

        if (await isProcessed(outboxId)) {
          console.log(`[PgBossEndpoint] Job already processed (${outboxId}), skipping`);
          return;
        }
        await config.handler(data.payload, { outboxId });
      });

      console.log(`[PgBossEndpoint] Registered ${config.handlerName} for ${config.eventType}`);
    }

  }
}
