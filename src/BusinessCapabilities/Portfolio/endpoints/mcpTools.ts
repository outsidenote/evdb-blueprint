// MCP tool exports — collected for discovery at startup.
// New slice → evdb-scaffold appends the per-slice descriptor + array entry.
// Mirrors the role of `routes.ts` for REST and `projections.ts` for read models.
import { addLoanToPortfolioMcpTool } from "../slices/AddLoanToPortfolio/mcp.js";
import type { McpToolDescriptor } from "#abstractions/mcp/types.js";
import { portfolioSummaryMcpTool } from "../slices/PortfolioSummary/mcp.js";
import { portfolioLoanDetailsMcpTool } from "../slices/PortfolioLoanDetails/mcp.js";

export const portfolioMcpTools: readonly McpToolDescriptor[] = [
  addLoanToPortfolioMcpTool,
  portfolioSummaryMcpTool,
  portfolioLoanDetailsMcpTool,
];
