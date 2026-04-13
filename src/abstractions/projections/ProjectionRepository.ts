/**
 * Interface for a queryable database client, supporting both Pool and PoolClient.
 */
export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * A single row in the projections table.
 */
export type ProjectionRow = {
  readonly key: string;
  readonly payload: unknown;
  readonly updatedAt: Date;
};

/**
 * Options for cursor-based pagination on betweenKeys queries.
 *
 * - `limit`       — max rows to return (default DEFAULT_LIMIT)
 * - `afterKey`    — cursor: return rows with key > afterKey
 * - `fromInclusive` — include the `from` bound (default true)
 * - `toInclusive`   — include the `to` bound (default false)
 *
 * Default bounds are `[from, to)` — inclusive start, exclusive end.
 * This makes continuous range iteration natural: the next page's `from`
 * can be the previous page's last key without overlap.
 */
export type RangeOptions = {
  readonly limit?: number;
  readonly afterKey?: string;
  readonly fromInclusive?: boolean;
  readonly toInclusive?: boolean;
};

/**
 * A page of projection rows with a flag indicating more results exist.
 */
export type ProjectionPage = {
  readonly rows: ProjectionRow[];
  readonly hasMore: boolean;
};

/**
 * Interface for the ProjectionRepository.
 */
export interface IProjectionRepository {
  byKey(projectionName: string, key: string): Promise<ProjectionRow | null>;
  byKeys(projectionName: string, keys: Iterable<string>): AsyncGenerator<ProjectionRow[]>;
  betweenKeys(projectionName: string, from: string, to: string, options?: RangeOptions): Promise<ProjectionPage>;
  byPrefix(projectionName: string, prefix: string, options?: { limit?: number; afterKey?: string }): Promise<ProjectionPage>;
}

/**
 * Read-side repository for the projections table.
 *
 * Retrieves projection read-model data by key, set of keys, or key range.
 * This is the read-side counterpart to ProjectionFactory (write-side).
 *
 * Accepts both `Pool` and `PoolClient` via the `Queryable` interface,
 * enabling use inside transactions when needed.
 */
export class ProjectionRepository implements IProjectionRepository {
  static readonly BATCH_SIZE = 100;
  static readonly DEFAULT_LIMIT = 100;

  constructor(private readonly db: Queryable) {}

  async byKey(projectionName: string, key: string): Promise<ProjectionRow | null> {
    assertNonEmpty(projectionName, "projectionName");
    assertNonEmpty(key, "key");

    const { rows } = await this.db.query(
      `SELECT key, payload, updated_at FROM projections WHERE name = $1 AND key = $2`,
      [projectionName, key],
    );
    if (rows.length === 0) return null;
    return toRow(rows[0]);
  }

  /**
   * Retrieve projections by a set of keys.
   *
   * Accepts any Iterable<string> — arrays, sets, or generators.
   * Internally batches into chunks of BATCH_SIZE and yields each batch
   * as a ProjectionRow[]. Results within each batch are ordered by key.
   */
  async *byKeys(projectionName: string, keys: Iterable<string>): AsyncGenerator<ProjectionRow[]> {
    assertNonEmpty(projectionName, "projectionName");

    for (const batch of chunk(keys, ProjectionRepository.BATCH_SIZE)) {
      const { rows } = await this.db.query(
        `SELECT key, payload, updated_at FROM projections WHERE name = $1 AND key = ANY($2) ORDER BY key`,
        [projectionName, batch],
      );
      yield rows.map(toRow);
    }
  }

  /**
   * Retrieve projections whose key falls within a range.
   *
   * Default bounds: `[from, to)` — inclusive start, exclusive end.
   * Override with `fromInclusive` / `toInclusive` options.
   *
   * Supports cursor-based pagination via `afterKey` (always exclusive).
   * When `afterKey` is set it takes precedence over `from` for the lower bound.
   */
  async betweenKeys(projectionName: string, from: string, to: string, options: RangeOptions = {}): Promise<ProjectionPage> {
    assertNonEmpty(projectionName, "projectionName");
    assertNonEmpty(from, "from");
    assertNonEmpty(to, "to");

    const limit = options.limit ?? ProjectionRepository.DEFAULT_LIMIT;
    const fromInclusive = options.fromInclusive ?? true;
    const toInclusive = options.toInclusive ?? false;

    const fromOp = fromInclusive ? ">=" : ">";
    const toOp = toInclusive ? "<=" : "<";

    if (options.afterKey != null) {
      // afterKey is always exclusive (key > afterKey), overrides from bound
      const { rows } = await this.db.query(
        `SELECT key, payload, updated_at FROM projections
         WHERE name = $1 AND key > $2 AND key ${toOp} $3
         ORDER BY key LIMIT $4`,
        [projectionName, options.afterKey, to, limit + 1],
      );
      return toPage(rows, limit);
    }

    const { rows } = await this.db.query(
      `SELECT key, payload, updated_at FROM projections
       WHERE name = $1 AND key ${fromOp} $2 AND key ${toOp} $3
       ORDER BY key LIMIT $4`,
      [projectionName, from, to, limit + 1],
    );
    return toPage(rows, limit);
  }

  async byPrefix(projectionName: string, prefix: string, options: { limit?: number; afterKey?: string } = {}): Promise<ProjectionPage> {
    assertNonEmpty(projectionName, "projectionName");
    assertNonEmpty(prefix, "prefix");

    const limit = options.limit ?? ProjectionRepository.DEFAULT_LIMIT;
    const pattern = prefix.replace(/%/g, "\\%").replace(/_/g, "\\_") + "%";

    if (options.afterKey != null) {
      const { rows } = await this.db.query(
        `SELECT key, payload, updated_at FROM projections
         WHERE name = $1 AND key LIKE $2 AND key > $3
         ORDER BY key LIMIT $4`,
        [projectionName, pattern, options.afterKey, limit + 1],
      );
      return toPage(rows, limit);
    }

    const { rows } = await this.db.query(
      `SELECT key, payload, updated_at FROM projections
       WHERE name = $1 AND key LIKE $2
       ORDER BY key LIMIT $3`,
      [projectionName, pattern, limit + 1],
    );
    return toPage(rows, limit);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toRow(raw: Record<string, unknown>): ProjectionRow {
  return {
    key: raw.key as string,
    payload: raw.payload,
    updatedAt: raw.updated_at as Date,
  };
}

function toPage(rows: Record<string, unknown>[], limit: number): ProjectionPage {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  return {
    rows: slice.map(toRow),
    hasMore,
  };
}

function assertNonEmpty(value: string, name: string): void {
  if (value.length === 0) {
    throw new Error(`${name} must not be empty`);
  }
}

/**
 * Chunks an iterable into arrays of at most `size` elements.
 */
function* chunk<T>(iterable: Iterable<T>, size: number): Generator<T[]> {
  let batch: T[] = [];
  for (const item of iterable) {
    batch.push(item);
    if (batch.length === size) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length > 0) {
    yield batch;
  }
}

/**
 * Convenience function to collect all batches from byKeys into a single array.
 */
export async function collectByKeys(
  repository: IProjectionRepository,
  projectionName: string,
  keys: Iterable<string>,
): Promise<ProjectionRow[]> {
  const result: ProjectionRow[] = [];
  for await (const batch of repository.byKeys(projectionName, keys)) {
    result.push(...batch);
  }
  return result;
}
