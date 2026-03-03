import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { PgBoss } from "pg-boss";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../..");

const MIGRATIONS = [
  "infrastructure/cdc/init.sql",
  "infrastructure/processed-jobs.sql",
] as const;

const POST_PGBOSS_MIGRATIONS = [
  "infrastructure/outbox-trigger.sql",
] as const;

function readSql(relativePath: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf-8");
}

/**
 * Manages a PostgreSQL testcontainer with all schema migrations applied.
 *
 * Encapsulates the ordering:
 *   1. Core tables (events, outbox, snapshot, processed_jobs)
 *   2. pg-boss start (creates pgboss schema)
 *   3. Outbox trigger (depends on pgboss schema)
 *
 * Reusable across all integration test files.
 */
export class TestDatabase {
  container!: StartedPostgreSqlContainer;
  client!: pg.Client;
  boss!: PgBoss;
  connectionUri!: string;

  async start(): Promise<void> {
    this.container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("eventualize")
      .withUsername("eventualize")
      .withPassword("eventualize123")
      .start();

    this.connectionUri = this.container.getConnectionUri();

    this.client = new pg.Client({ connectionString: this.connectionUri });
    await this.client.connect();

    for (const migration of MIGRATIONS) {
      await this.client.query(readSql(migration));
    }

    this.boss = new PgBoss({ connectionString: this.connectionUri });
    await this.boss.start();

    for (const migration of POST_PGBOSS_MIGRATIONS) {
      await this.client.query(readSql(migration));
    }
  }

  async stop(): Promise<void> {
    if (this.boss) await this.boss.stop({ graceful: true, timeout: 5000 });
    if (this.client) await this.client.end();
    if (this.container) await this.container.stop();
  }
}
