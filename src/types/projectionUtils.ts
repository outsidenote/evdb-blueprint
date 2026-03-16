import { Pool } from "pg";
import { type ProjectionConfig, type SqlStatement, type HandlerMeta, ProjectionModeType } from "./ProjectionFactory.js";

const IDEMPOTENCY_INSERT_SQL = `
  INSERT INTO projection_idempotency (projection_name, idempotency_key)
  VALUES ($1, $2)
  ON CONFLICT (projection_name, idempotency_key) DO NOTHING
  RETURNING 1`;

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
    } catch {
      /* swallow ROLLBACK errors — original error is re-thrown below */
    }
    throw e;
  } finally {
    client.release();
  }
}

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
    } catch {
      /* swallow ROLLBACK errors — original error is re-thrown below */
    }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Applies a single projection event against the database.
 * Single source of truth for projection execution strategy — used by both
 * ProjectionFactory (production) and ProjectionSliceTester (tests).
 */
export async function applyProjectionEvent(
  pool: Pool,
  projection: ProjectionConfig,
  messageType: string,
  payload: Record<string, unknown>,
  eventMeta: Omit<HandlerMeta, "projectionName">,
): Promise<void> {
  const handler = projection.handlers[messageType];
  if (!handler) return;

  const meta: HandlerMeta = { ...eventMeta, projectionName: projection.projectionName };
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
}
