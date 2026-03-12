import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { PgBossEndpointConfig } from "../../types/PgBossEndpointFactory.js";
import pg from "pg";
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import EvDbPrismaStorageAdapter from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";
import { PgBossEndpointFactory } from "../../types/PgBossEndpointFactory.js";
import type { TestDatabase } from "./TestDatabase.js";

export interface TestAppOptions {
  workers: (storageAdapter: IEvDbStorageAdapter) => PgBossEndpointConfig<any>[];
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
  const storageAdapter = new EvDbPrismaStorageAdapter(storeClient as any);
  const pool = new pg.Pool({ connectionString: db.connectionUri });

  await PgBossEndpointFactory.startAll(db.boss, options.workers(storageAdapter), pool);

  return { storageAdapter, pool };
}
