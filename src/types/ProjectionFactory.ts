import { type Kafka } from "kafkajs";
import { Pool, type PoolClient } from "pg";
import { launchKafkaConsumer } from "./kafkaConsumerUtils.js";

/**
 * Base shape shared by all SQL-bearing result types.
 * Use this when you need a plain `{ sql, params }` without a `type` discriminant.
 */
export type SqlStatement = {
  readonly sql: string;
  readonly params: unknown[];
};

/**
 * Plain SQL statement.
 * Use when the SQL itself is safe to execute multiple times
 * (e.g. UPSERT, DELETE, MAX updates).
 */
export type SqlQuery = SqlStatement & {
  readonly type: "query";
};

/**
 * Multiple SQL statements executed atomically.
 * Use when the projection cannot be expressed as a single idempotent statement.
 */
export type SqlTransaction = {
  readonly type: "transaction";
  readonly statements: SqlStatement[];
};

/**
 * An idempotent projection result for accumulating projections (e.g. running balance).
 *
 * Produced by `idempotentProjection()` — do not construct manually.
 * The factory handles the idempotency check and business SQL atomically.
 */
export type IdempotentSqlQuery = SqlStatement & {
  readonly type: "idempotent";
  readonly idempotencyKey: string;
};

type HandlerMeta = { outboxId: string; projectionName: string };

/**
 * Generates a SQL result to apply to the projections table.
 * Return null to ignore the message.
 *
 * `meta.projectionName` is the same value as `ProjectionConfig.projectionName` —
 * use it in SQL params instead of hardcoding the name, so generated slices stay generic.
 */
export type ProjectionHandler<T = unknown> = (
  payload: T,
  meta: HandlerMeta,
) => SqlQuery | SqlTransaction | IdempotentSqlQuery | null;

/**
 * `any` is used here because the handlers map can contain handlers with
 *  different payload types. Each handler still defines its own payload type.
 */
export interface ProjectionConfig<
  THandlers extends Record<string, ProjectionHandler<any>> = Record<string, ProjectionHandler<any>>
> {
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
  readonly handlers: THandlers;
}

/**
 * Creates an idempotent projection handler.
 *
 * Both `getIdempotencyKey` and `buildQuery` receive the full `meta` object,
 * so you can key on `outboxId`, `projectionName`, or payload fields.
 *
 * Usage:
 *   FundsWithdrawn: idempotentProjection(
 *     (p: FundsWithdrawnPayload, _meta) => p.transactionId,
 *     (p, { projectionName }) => ({ sql: `INSERT INTO projections ...`, params: [...] })
 *   )
 */
export function idempotentProjection<T>(
  getIdempotencyKey: (payload: T, meta: HandlerMeta) => string,
  buildQuery: (payload: T, meta: HandlerMeta) => SqlStatement,
): ProjectionHandler<T> {
  return (payload, meta) => {
    const { sql, params } = buildQuery(payload, meta);
    return {
      type: "idempotent",
      idempotencyKey: getIdempotencyKey(payload, meta),
      sql,
      params,
    };
  };
}

// ─── internal helpers ────────────────────────────────────────────────────────

async function withTransaction(pool: Pool, fn: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await fn(client);
    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Projection factory.
 *
 * Consumes Kafka messages and applies SQL queries directly to the projections table.
 * This is the pattern for building persistent read models from domain events.
 *
 * Flow: Kafka topic → consumer → handler → pool.query()
 *
 * Topics are subscribed to as `events.{messageType}` for each key in `handlers`.
 * The consumer groupId is derived as `projection.{projectionName}`.
 */
export class ProjectionFactory {
  private handles: { stop: () => Promise<void> }[] = [];

  static async startAll(
    kafka: Kafka,
    pool: Pool,
    projections: ProjectionConfig[],
  ): Promise<ProjectionFactory> {
    const factory = new ProjectionFactory();

    for (const projection of projections) {
      const groupId = `projection.${projection.projectionName}`;
      const topics = Object.keys(projection.handlers).map((t) => `events.${t}`);

      const handle = launchKafkaConsumer({
        kafka,
        groupId,
        topics,
        onMessage: async (topic, payload, outboxId) => {
          const messageType = topic.replace(/^events\./, "");
          const handler = projection.handlers[messageType];
          if (!handler) return;

          const meta: HandlerMeta = { outboxId, projectionName: projection.projectionName };
          const result = handler(payload, meta);
          if (!result) return;

          if (result.type === "transaction") {
            await withTransaction(pool, async (client) => {
              for (const stmt of result.statements) {
                await client.query(stmt.sql, stmt.params);
              }
            });
          } else if (result.type === "idempotent") {
            await withTransaction(pool, async (client) => {
              const { rows } = await client.query(
                `INSERT INTO projection_idempotency (projection_name, business_key)
                 VALUES ($1, $2)
                 ON CONFLICT (projection_name, business_key) DO NOTHING
                 RETURNING 1`,
                [projection.projectionName, result.idempotencyKey],
              );
              if (rows.length > 0) {
                await client.query(result.sql, result.params);
              }
            });
          } else {
            await pool.query(result.sql, result.params);
          }

          console.log(`[Projection] ${topic} → ${groupId} outboxId=${outboxId}`);
        },
      });
      factory.handles.push(handle);
    }

    return factory;
  }

  async stop(): Promise<void> {
    await Promise.allSettled(this.handles.map((h) => h.stop()));
  }
}
