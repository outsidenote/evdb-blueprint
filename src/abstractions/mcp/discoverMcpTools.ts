import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpToolDescriptor } from "./types.js";
import { isActiveContext } from "../activeContext.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BC_DIR = join(__dirname, "..", "..", "BusinessCapabilities");

/**
 * Discovers MCP tool descriptors across active BusinessCapabilities contexts.
 *
 * Convention: each context with MCP tools has a file at
 *   `BusinessCapabilities/<Context>/endpoints/mcpTools.ts`
 * that exports one or more arrays of McpToolDescriptor (e.g. `fundsMcpTools`).
 *
 * Discovery scans active contexts, imports their mcpTools module, and
 * collects every exported array into a flat list.
 *
 * Filtered by ACTIVE_CONTEXT env var.
 */
export async function discoverMcpTools(): Promise<McpToolDescriptor[]> {
  if (!existsSync(BC_DIR)) return [];
  const contexts = await readdir(BC_DIR);
  const allTools: McpToolDescriptor[] = [];

  for (const ctx of contexts) {
    if (!isActiveContext(ctx)) continue;

    try {
      const mod = await import(`#BusinessCapabilities/${ctx}/endpoints/mcpTools.js`);
      for (const value of Object.values(mod)) {
        if (Array.isArray(value)) {
          allTools.push(...(value as McpToolDescriptor[]));
        }
      }
    } catch {
      // This context has no mcpTools.ts — skip
    }
  }

  return allTools;
}
