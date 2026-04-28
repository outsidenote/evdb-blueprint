// Projection slice exports — collected for discovery at startup
import { portfolioSummarySlice } from "./PortfolioSummary/index.js";
import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { portfolioExposureSlice } from "./PortfolioExposure/index.js";
import { portfolioLoanDetailsSlice } from "./PortfolioLoanDetails/index.js";
import { loanSubmissionStatusSlice } from "./LoanSubmissionStatus/index.js";

export const portfolioProjections: readonly ProjectionConfig[] = [
  portfolioSummarySlice,
  portfolioExposureSlice,
  portfolioLoanDetailsSlice,
  loanSubmissionStatusSlice,
];
