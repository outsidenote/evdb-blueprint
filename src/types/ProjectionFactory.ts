import { type Kafka } from "kafkajs";
import { Pool } from "pg";
import { launchKafkaConsumer } from "./kafkaConsumerUtils.js";

/**
 * Base shape for a parameterized SQL statement.
 */
export type SqlStatement = {
  readonly sql: string;
  readonly params: unknown[];
};

type HandlerMeta = { outboxId: string; projectionName: string };

/**
 * Returns the SQL statements to apply for this message.
 * Return null to ignore the message.
 *
 * `meta.projectionName` is the same value as `ProjectionConfig.projectionName` —
 * use it in SQL params instead of hardcoding the name, so generated slices stay generic.
 */
export type ProjectionHandler<T = unknown> = (
  payload: T,
  meta: HandlerMeta,
) => SqlStatement[] | null;

export enum ProjectionModeType {
  /** Run each statement directly — use for naturally idempotent SQL (UPSERT, DELETE). */
  Query = "query",
  /** Run all statements atomically — use when multiple statements must succeed together. */
  Transaction = "transaction",
  /** Run statements only once per idempotency key — use for accumulating projections
   *  (running totals, counters) where replaying would double-count. */
  Idempotent = "idempotent",
}

export type ProjectionMode =
  | { readonly type: ProjectionModeType.Query }
  | { readonly type: ProjectionModeType.Transaction }
  | {
      readonly type: ProjectionModeType.Idempotent;
      readonly getIdempotencyKey: (payload: unknown, meta: HandlerMeta) => string;
    };

/**
 * `any` is used in THandlers because the map can contain handlers with
 * different payload types. Each handler still defines its own payload type.
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
   * Execution strategy — constant for the projection's lifetime.
   * All handlers in this projection run under the same mode.
   */
  readonly mode: ProjectionMode;
  /**
   * Map of messageType → SQL generator.
   * Topics are derived as `events.{messageType}`.
   * Messages with no matching handler are ignored.
   */
  readonly handlers: THandlers;
}


const IDEMPOTENCY_INSERT_SQL = `
  INSERT INTO projection_idempotency (projection_name, idempotency_key)
  VALUES ($1, $2)
  ON CONFLICT (projection_name, idempotency_key) DO NOTHING
  RETURNING 1`;

/**
 * the execution strategy for "transaction" mode — runs all statements inside a transaction,
 * rolling back if any statement fails. Use for consistency when multiple statements must succeed together.
 * @param pool 
 * @param statements 
 */
  async function withTransaction(pool: Pool, statements: SqlStatement[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const stmt of statements) {
      await client.query(stmt.sql, stmt.params);
    }
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

/**
 * cases where we want to ensure that a given message only applies once,
 * even if it is replayed (e.g. due to a crash after processing but before offset commit).
 *
 * This function attempts to insert a record into the `projection_idempotency` table
 * with the given `projectionName` and `idempotencyKey`. If the insert succeeds, it runs
 * the statements inside a transaction. If the insert fails due to a conflict, it means
 * these statements have already been applied for this key, so it skips them.
 * @param pool 
 * @param projectionName 
 * @param idempotencyKey 
 * @param statements 
 */
async function withIdempotentTransaction(
  pool: Pool,
  projectionName: string,
  idempotencyKey: string,
  statements: SqlStatement[],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(IDEMPOTENCY_INSERT_SQL, [projectionName, idempotencyKey]);
    if (rows.length > 0) {
      for (const stmt of statements) {
        await client.query(stmt.sql, stmt.params);
      }
    }
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
          // Invoke the handler to get the SQL statements to run for this message.
          //  The handler can return null to skip messages it doesn't care about.
          const statements = handler(payload, meta);
          if (!statements) return;

          const { mode } = projection;

          if (mode.type === ProjectionModeType.Transaction) {
            await withTransaction(pool, statements);
          } else if (mode.type === ProjectionModeType.Idempotent) {
            const key = mode.getIdempotencyKey(payload, meta);
            await withIdempotentTransaction(pool, projection.projectionName, key, statements);
          } else {
            for (const stmt of statements) {
              await pool.query(stmt.sql, stmt.params);
            }
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
