import express from "express";
import swaggerUi from "swagger-ui-express";
import { Kafka } from "kafkajs";
import { PgBoss } from "pg-boss";
import { createWithdrawalRouter } from "./routes/withdrawal.js";
import { swaggerDocument } from "./swagger.js";
import { PgBossEndpointFactory } from "./types/PgBossEndpointFactory.js";
import { KafkaConsumerEndpointFactory } from "./types/KafkaConsumerEndpointFactory.js";
import { createFundsWithdrawalApprovedWorker } from "./BusinessCapabilities/Funds/endpoints/CalculateWithdrawComission/pg-boss/index.js";
import { createWithdrawCommissionCalculatedWorker } from "./BusinessCapabilities/Funds/endpoints/WithdrawFunds/pg-boss/index.js";
import { createFundsWithdrawnKafkaConsumer } from "./BusinessCapabilities/FraudAnalysis/endpoints/RecordFundWithdrawAction/kafka/index.js";
import { createFundsWithdrawnWorker } from "./BusinessCapabilities/FraudAnalysis/endpoints/RecordFundWithdrawAction/pg-boss/index.js";
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import EvDbPrismaStorageAdapter from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";

const CONNECTION_URI =
    process.env.POSTGRES_CONNECTION ?? "postgres://eventualize:eventualize123@localhost:5433/eventualize";

const storeClient = EvDbPostgresPrismaClientFactory.create(CONNECTION_URI);
const storageAdapter = new EvDbPrismaStorageAdapter(storeClient as any);

const PORT = Number(process.env.PORT) || 3000;

async function main() {

  // Start pg-boss (uses the same Postgres)
  const boss = new PgBoss(CONNECTION_URI);
  await boss.start();
  console.log("pg-boss started");

  // Register outbox pg-boss endpoints: trigger delivers jobs, factory registers handlers
  await PgBossEndpointFactory.startAll(boss, [
    createFundsWithdrawalApprovedWorker(storageAdapter),
    createWithdrawCommissionCalculatedWorker(storageAdapter),
    createFundsWithdrawnWorker(storageAdapter),
  ]);

  // Register Kafka consumer endpoints (non-blocking): CDC → Kafka → pg-boss → command handler
  const kafkaBootstrap = process.env.KAFKA_BOOTSTRAP ?? "localhost:9092";
  const kafka = new Kafka({ clientId: "evdb-blueprint", brokers: [kafkaBootstrap] });
  let kafkaConsumers: KafkaConsumerEndpointFactory | undefined;
  KafkaConsumerEndpointFactory.startAll(kafka, boss, [
    createFundsWithdrawnKafkaConsumer(storageAdapter),
  ]).then((consumers) => {
    kafkaConsumers = consumers;
  }).catch((err) => {
    console.error("[KafkaConsumer] Failed to start (will retry on next restart):", err.message);
  });

  const app = express();
  app.use(express.json());
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  app.use("/api/withdrawals", createWithdrawalRouter(storageAdapter));

  app.listen(PORT, () => {
    console.log(`Withdrawal API running at http://localhost:${PORT}`);
    console.log(`  Swagger UI: http://localhost:${PORT}/api-docs`);
    console.log(`  POST /api/withdrawals/approve`);
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    await kafkaConsumers?.stop();
    await boss.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
