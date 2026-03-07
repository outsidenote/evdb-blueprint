import { Job, PgBoss } from "pg-boss";

export interface PgBossEndpointContext {
  readonly outboxId: string;
}

export interface PgBossEndpointConfig<TPayload = Record<string, unknown>> {
  readonly eventType: string;
  readonly handlerName: string;
  readonly handler: (payload: TPayload, context: PgBossEndpointContext) => Promise<void>;
}

/** Builds the pg-boss queue name from event type and handler name. */
export function pgBossQueueName(pgBossEndpointConfig: PgBossEndpointConfig<any>): string {
  const { eventType, handlerName } = pgBossEndpointConfig;
  return `outbox.${eventType}.${handlerName}`;
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
      const queueName = pgBossQueueName(config);

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
