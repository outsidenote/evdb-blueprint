import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import { EvDbPrismaStorageAdapter } from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";
import WithdrawalApprovalStreamFactory from "./streams/WithdrawalApprovalStreamFactory/index.js";
import { EvDbEventStoreBuilder } from "@eventualize/core/store/EvDbEventStoreBuilder";

const CONNECTION_URI =
    process.env.POSTGRES_CONNECTION ?? "postgres://eventualize:eventualize123@localhost:5433/eventualize";

const storeClient = EvDbPostgresPrismaClientFactory.create(CONNECTION_URI);
const storageAdapter = new EvDbPrismaStorageAdapter(storeClient as any);


export const eventStore = new EvDbEventStoreBuilder()
    .withAdapter(storageAdapter)
    .withStreamFactory(WithdrawalApprovalStreamFactory)
    .build();

export type EventStoreType = typeof eventStore;