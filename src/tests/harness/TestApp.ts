import express from "express";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { PgBossEndpointConfig } from "../../types/PgBossEndpointFactory.js";
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import EvDbPrismaStorageAdapter from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";
import { PgBossEndpointFactory } from "../../types/PgBossEndpointFactory.js";
import type { TestDatabase } from "./TestDatabase.js";

export interface TestAppOptions {
  workers: (storageAdapter: IEvDbStorageAdapter) => PgBossEndpointConfig<any>[];
  routes: (app: express.Express, storageAdapter: IEvDbStorageAdapter) => void;
}

export interface TestAppContext {
  app: express.Express;
  storageAdapter: IEvDbStorageAdapter;
}

/**
 * Creates a fully wired Express app for integration testing.
 *
 * Generic: the caller provides its own workers and routes.
 * Each slice can create its own integration test without modifying shared files.
 */
export async function createTestApp(db: TestDatabase, options: TestAppOptions): Promise<TestAppContext> {
  const storeClient = EvDbPostgresPrismaClientFactory.create(db.connectionUri);
  const storageAdapter = new EvDbPrismaStorageAdapter(storeClient as any);

  await PgBossEndpointFactory.startAll(db.boss, options.workers(storageAdapter));

  const app = express();
  app.use(express.json());
  options.routes(app, storageAdapter);

  return { app, storageAdapter };
}
