// Projection slice exports — collected for discovery at startup
import { portfolioSummarySlice } from "./PortfolioSummary/index.js";
import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { portfolioLoanDetailsSlice } from "./PortfolioLoanDetails/index.js";
import { readModelSlice } from "./ReadModel/index.js";

export const portfolioProjections: readonly ProjectionConfig[] = [
  portfolioSummarySlice,
  portfolioLoanDetailsSlice,
  readModelSlice,
];
