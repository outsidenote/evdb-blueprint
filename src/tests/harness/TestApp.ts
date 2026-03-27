import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { PgBossEndpointConfigBase } from "../../types/abstractions/endpoints/PgBossEndpointConfig.js";
import pg from "pg";
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import EvDbPrismaStorageAdapter from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";
import { PgBossEndpointFactory } from "../../types/abstractions/endpoints/PgBossEndpointFactory.js";
import { OutboxIdempotencyGate } from "../../types/abstractions/endpoints/IdempotencyGate.js";
import type { TestDatabase } from "./TestDatabase.js";

export interface TestAppOptions {
  workers: (storageAdapter: IEvDbStorageAdapter) => PgBossEndpointConfigBase[];
}

export interface TestAppContext {
  storageAdapter: IEvDbStorageAdapter;
  pool: pg.Pool;
}

/**
 * Wires up the storage adapter and pg-boss workers for integration testing.
 *
 * Generic: the caller provides its own workers.
 * Each slice can create its own integration test without modifying shared files.
 */
export async function createTestApp(db: TestDatabase, options: TestAppOptions): Promise<TestAppContext> {
  const storeClient = EvDbPostgresPrismaClientFactory.create(db.connectionUri);
  const storageAdapter = new EvDbPrismaStorageAdapter(storeClient);
  const pool = new pg.Pool({ connectionString: db.connectionUri });

  const idempotencyGate = new OutboxIdempotencyGate(pool);
  await PgBossEndpointFactory.startAll(db.boss, options.workers(storageAdapter), idempotencyGate);

  return { storageAdapter, pool };
}
