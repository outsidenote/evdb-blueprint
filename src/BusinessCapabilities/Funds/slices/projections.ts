// Projection slice exports — collected for discovery at startup
import { pendingWithdrawalLookupSlice } from "./PendingWithdrawalLookup/index.js";
import { accountBalanceReadModelSlice } from "./AccountBalanceReadModel/index.js";
import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";

export const fundsProjections: readonly ProjectionConfig[] = [
  pendingWithdrawalLookupSlice,
  accountBalanceReadModelSlice,
];
