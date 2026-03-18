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
 */
export type PageOptions = {
  readonly limit?: number;
  readonly afterKey?: string;
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
  byKeys(projectionName: string, keys: string[]): Promise<ProjectionRow[]>;
  betweenKeys(projectionName: string, from: string, to: string, page?: PageOptions): Promise<ProjectionPage>;
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
  static readonly MAX_KEYS = 100;
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

  async byKeys(projectionName: string, keys: string[]): Promise<ProjectionRow[]> {
    assertNonEmpty(projectionName, "projectionName");

    if (keys.length === 0) return [];
    if (keys.length > ProjectionRepository.MAX_KEYS) {
      throw new Error(`byKeys supports at most ${ProjectionRepository.MAX_KEYS} keys`);
    }

    const { rows } = await this.db.query(
      `SELECT key, payload, updated_at FROM projections WHERE name = $1 AND key = ANY($2) ORDER BY key`,
      [projectionName, keys],
    );
    return rows.map(toRow);
  }

  async betweenKeys(projectionName: string, from: string, to: string, page: PageOptions = {}): Promise<ProjectionPage> {
    assertNonEmpty(projectionName, "projectionName");
    assertNonEmpty(from, "from");
    assertNonEmpty(to, "to");

    const limit = page.limit ?? ProjectionRepository.DEFAULT_LIMIT;

    if (page.afterKey != null) {
      const { rows } = await this.db.query(
        `SELECT key, payload, updated_at FROM projections
         WHERE name = $1 AND key BETWEEN $2 AND $3 AND key > $4
         ORDER BY key LIMIT $5`,
        [projectionName, from, to, page.afterKey, limit + 1],
      );
      return toPage(rows, limit);
    }

    const { rows } = await this.db.query(
      `SELECT key, payload, updated_at FROM projections
       WHERE name = $1 AND key BETWEEN $2 AND $3
       ORDER BY key LIMIT $4`,
      [projectionName, from, to, limit + 1],
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
