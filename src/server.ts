import express from "express";
import swaggerUi from "swagger-ui-express";
import { EvDbPrismaStorageAdapter } from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import WithdrawalApprovalStreamFactory from "./eventstore/WithdrawalApprovalsStream/withdrawalApprovalStreamFactory.js";
import { createWithdrawalRouter } from "./routes/withdrawal.js";
import { swaggerDocument } from "./swagger.js";
import { EvDbEventStoreBuilder } from "@eventualize/core/store/EvDbEventStoreBuilder";

const PORT = Number(process.env.PORT) || 3000;
const CONNECTION_URI =
  process.env.POSTGRES_CONNECTION ?? "postgres://eventualize:eventualize123@localhost:5433/eventualize";

async function main() {
  const storeClient = EvDbPostgresPrismaClientFactory.create(CONNECTION_URI);
  const storageAdapter = new EvDbPrismaStorageAdapter(storeClient as any);

  const eventStore = new EvDbEventStoreBuilder()
    .withAdapter(storageAdapter)
    .withStreamFactory(WithdrawalApprovalStreamFactory)
    .build();

  const app = express();
  app.use(express.json());
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  app.use("/api/withdrawals", createWithdrawalRouter(eventStore as any));

  app.listen(PORT, () => {
    console.log(`Withdrawal API running at http://localhost:${PORT}`);
    console.log(`  Swagger UI: http://localhost:${PORT}/api-docs`);
    console.log(`  POST /api/withdrawals/approve`);
    console.log(`  GET  /api/withdrawals/:streamId`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
