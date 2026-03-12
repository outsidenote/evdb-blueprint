import { type Kafka, type Consumer } from "kafkajs";
import { Pool } from "pg";
import { launchKafkaConsumer } from "./kafkaConsumerUtils.js";

export type SqlQuery = {
  readonly sql: string;
  readonly params: unknown[];
};

/**
 * A transactional projection result — two or more SQL statements executed atomically.
 *
 * Use this when the projection cannot be expressed as a single idempotent statement,
 * for example an accumulating projection (e.g. running balance) where:
 *   1. An idempotency key is inserted to guard against replay double-counting.
 *   2. The snapshot is updated only if the idempotency key was new.
 *
 * Simple projections (UPSERT / DELETE / MAX) are naturally replay-safe and should
 * return a plain SqlQuery instead.
 */
export type SqlTransaction = {
  readonly statements: SqlQuery[];
};

/**
 * Generates a SQL query (or transaction) to apply to the projections table.
 * Return null to ignore the message.
 *
 * `meta.projectionName` is the same value as `ProjectionConfig.projectionName` —
 * use it in SQL params instead of hardcoding the name, so generated slices stay generic.
 */
export type ProjectionHandler<T = Record<string, unknown>> = (
  payload: T,
  meta: { outboxId: string; projectionName: string },
) => SqlQuery | SqlTransaction | null;

export interface ProjectionConfig {
  /**
   * The logical name of this projection (e.g. "PendingWithdrawalLookup").
   * Used as the `name` column in the projections table and to derive the consumer groupId.
   * This is the primary template variable for code generation — set it once here,
   * and reference it via `meta.projectionName` inside handlers.
   */
  readonly projectionName: string;
  /**
   * Map of messageType → SQL generator.
   * Topics are derived as `events.{messageType}`.
   * Messages with no matching handler are ignored.
   */
  readonly handlers: Record<string, ProjectionHandler>;
}

/**
 * Projection factory.
 *
 * Consumes Kafka messages and applies SQL queries directly to the projections table.
 * This is the pattern for building persistent read models from domain events.
 *
 * Flow: Kafka topic → consumer → sqlGenerator → pool.query()
 *
 * Topics are subscribed to as `events.{messageType}` for each key in `handlers`.
 * The consumer groupId is derived as `projection.{projectionName}`.
 * Operations (UPSERT / DELETE) are naturally idempotent — no processed_jobs needed.
 */
export class ProjectionFactory {
  private consumers: Consumer[] = [];
  private retryTimers: ReturnType<typeof setTimeout>[] = [];

  static async startAll(
    kafka: Kafka,
    pool: Pool,
    projections: ProjectionConfig[],
  ): Promise<ProjectionFactory> {
    const factory = new ProjectionFactory();
    for (const projection of projections) {
      const groupId = `projection.${projection.projectionName}`;
      const topics = Object.keys(projection.handlers).map((t) => `events.${t}`);

      launchKafkaConsumer({
        kafka,
        groupId,
        topics,
        consumers: factory.consumers,
        retryTimers: factory.retryTimers,
        onMessage: async (topic, payload, outboxId) => {
          const messageType = topic.replace(/^events\./, "");
          const handler = projection.handlers[messageType];
          if (!handler) return;

          const result = handler(payload, { outboxId, projectionName: projection.projectionName });
          if (!result) return;

          if ("statements" in result) {
            const client = await pool.connect();
            try {
              await client.query("BEGIN");
              for (const stmt of result.statements) {
                await client.query(stmt.sql, stmt.params);
              }
              await client.query("COMMIT");
            } catch (e) {
              await client.query("ROLLBACK");
              throw e;
            } finally {
              client.release();
            }
          } else {
            await pool.query(result.sql, result.params);
          }
          console.log(`[Projection] ${topic} → ${groupId} outboxId=${outboxId}`);
        },
      });
    }
    return factory;
  }

  async stop(): Promise<void> {
    for (const timer of this.retryTimers) clearTimeout(timer);
    for (const consumer of this.consumers) {
      await consumer.disconnect().catch(() => {});
    }
  }
}
