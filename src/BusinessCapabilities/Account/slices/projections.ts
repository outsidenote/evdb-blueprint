// Projection slice exports — collected for discovery at startup
import { accountViewSlice } from "./AccountView/index.js";
import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";

export const accountProjections: readonly ProjectionConfig[] = [
  accountViewSlice,
];
