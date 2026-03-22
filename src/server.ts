import express from "express";
import swaggerUi from "swagger-ui-express";
import { Kafka } from "kafkajs";
import { PgBoss } from "pg-boss";
import pg from "pg";
import { createServer, type Server } from "node:http";

import { createWithdrawalRouter } from "./routes/withdrawal.js";
import { createProjectionRouter } from "./types/abstractions/router/projections.js";
import { ProjectionRepository } from "./types/abstractions/projections/ProjectionRepository.js";
import { swaggerDocument } from "./swagger.js";
import { PgBossEndpointFactory } from "./types/abstractions/endpoints/PgBossEndpointFactory.js";
import { ProjectionFactory } from "./types/abstractions/projections/ProjectionFactory.js";
import { createFundsWithdrawalApprovedWorker } from "./BusinessCapabilities/Funds/endpoints/CalculateWithdrawComission/pg-boss/index.js";
import { createWithdrawCommissionCalculatedWorker } from "./BusinessCapabilities/Funds/endpoints/WithdrawFunds/pg-boss/index.js";
import { createFundsWithdrawnWorker } from "./BusinessCapabilities/FraudAnalysis/endpoints/RecordFundWithdrawAction/pg-boss/index.js";
import { pendingWithdrawalLookupSlice } from "./BusinessCapabilities/Funds/slices/PendingWithdrawalLookup/index.js";
import { accountBalanceReadModelSlice } from "./BusinessCapabilities/Funds/slices/AccountBalanceReadModel/index.js";
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import EvDbPrismaStorageAdapter from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";

const config = {
  postgresConnection:
    process.env.POSTGRES_CONNECTION ??
    "postgres://eventualize:eventualize123@localhost:5433/eventualize",
  kafkaBootstrap: process.env.KAFKA_BOOTSTRAP ?? "localhost:9092",
  port: Number(process.env.PORT ?? 3000),
};

async function startServer(app: express.Express, port: number): Promise<Server> {
  const server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => resolve());
  });

  return server;
}

async function stopServer(server?: Server): Promise<void> {
  if (!server) return;

  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function main() {
  const storeClient = EvDbPostgresPrismaClientFactory.create(config.postgresConnection);
  const storageAdapter = new EvDbPrismaStorageAdapter(storeClient);

  const kafka = new Kafka({
    clientId: "evdb-blueprint",
    brokers: [config.kafkaBootstrap],
  });

  const pool = new pg.Pool({ connectionString: config.postgresConnection });

  const boss = new PgBoss(config.postgresConnection);
  await boss.start();
  console.log("[Startup] pg-boss started");

  const pgBossFactory = await PgBossEndpointFactory.startAll(boss, [
    createFundsWithdrawalApprovedWorker(storageAdapter),
    createWithdrawCommissionCalculatedWorker(storageAdapter),
    createFundsWithdrawnWorker(storageAdapter),
  ], pool, kafka);
  console.log("[Startup] pg-boss workers registered");

  const projectionSlices = [
    pendingWithdrawalLookupSlice,
    accountBalanceReadModelSlice,
  ];

  const projectionFactory = await ProjectionFactory.startAll(kafka, pool, projectionSlices);
  console.log("[Startup] projections registered");

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/ready", (_req, res) => {
    res.status(200).json({ status: "ready" });
  });

  const projectionRepository = new ProjectionRepository(pool);
  const allowedProjections = new Set(projectionSlices.map((s) => s.projectionName));

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  app.use("/api/projections", createProjectionRouter(projectionRepository, allowedProjections));
  app.use("/api/withdrawals", createWithdrawalRouter(storageAdapter));

  const httpServer = await startServer(app, config.port);

  console.log(`[Startup] Withdrawal API running at http://localhost:${config.port}`);
  console.log(`[Startup] Swagger UI: http://localhost:${config.port}/api-docs`);
  console.log(`[Startup] POST /api/withdrawals/approve`);
  console.log(`[Startup] GET  /api/projections/:projectionName`);

  // Graceful shutdown
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`[Shutdown] Received ${signal}, stopping services...`);

    const results = await Promise.allSettled([
      pgBossFactory.stop(),
      projectionFactory.stop(),
      stopServer(httpServer),
      boss.stop(),
      pool.end(),
    ]);

    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[Shutdown] Cleanup error:", result.reason);
      }
    }

    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[Startup] Failed to start server:", err);
  process.exit(1);
});
