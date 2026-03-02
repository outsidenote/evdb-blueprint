import { PgBoss } from "pg-boss";

export interface PgBossEndpointContext {
  readonly outboxId: string;
}

export interface PgBossEndpointConfig<TPayload = Record<string, unknown>> {
  readonly eventType: string;
  readonly handlerName: string;
  readonly handler: (payload: TPayload, context: PgBossEndpointContext) => Promise<void>;
}

/** Builds the pg-boss queue name from event type and handler name. */
export function pgBossQueueName(eventType: string, handlerName: string): string {
  return `outbox.${eventType}.${handlerName}`;
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
 * On restart: nothing to catch up — jobs already exist in pgboss.job.
 * boss.work() resumes processing any pending/failed jobs automatically.
 *
 * See: infrastructure/outbox-trigger.sql for the trigger definition.
 */
export class PgBossEndpointFactory {

  static async startAll(
    boss: PgBoss,
    endpoints: PgBossEndpointConfig<any>[],
  ): Promise<void> {
    for (const config of endpoints) {
      const queueName = pgBossQueueName(config.eventType, config.handlerName);

      await boss.createQueue(queueName);

      await boss.work(queueName, async ([job]) => {
        const data = job.data as { outboxId: string; payload: Record<string, unknown> };
        await config.handler(data.payload, { outboxId: data.outboxId });
      });

      console.log(`[PgBossEndpoint] Registered ${config.handlerName} for ${config.eventType}`);
    }
  }
}
