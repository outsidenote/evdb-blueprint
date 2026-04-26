// MCP tool exports — collected for discovery at startup.
// New slice → evdb-scaffold appends the per-slice descriptor + array entry.
// Mirrors the role of `routes.ts` for REST and `projections.ts` for read models.
import { createAccountMcpTool } from "./CreateAccount/MCP/index.js";
import type { McpToolDescriptor } from "#abstractions/mcp/types.js";
import { accountViewMcpTool } from "../slices/AccountView/mcp.js";

export const accountMcpTools: readonly McpToolDescriptor[] = [
  createAccountMcpTool,
  accountViewMcpTool,
];
