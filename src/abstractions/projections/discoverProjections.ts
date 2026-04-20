import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectionConfig } from "./ProjectionFactory.js";
import { isActiveContext } from "../activeContext.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BC_DIR = join(__dirname, "..", "..", "BusinessCapabilities");

/**
 * Discovers projection configs across active BusinessCapabilities contexts.
 *
 * Convention: each context with projections has a file at
 *   `BusinessCapabilities/<Context>/slices/projections.ts`
 * that exports a named array of ProjectionConfig objects (e.g. `fundsProjections`).
 *
 * Discovery scans active contexts, imports their projections module, and collects
 * every exported array into a flat list.
 *
 * Filtered by ACTIVE_CONTEXT env var.
 */
export async function discoverProjections(): Promise<ProjectionConfig[]> {
  if (!existsSync(BC_DIR)) return [];
  const contexts = await readdir(BC_DIR);
  const allProjections: ProjectionConfig[] = [];

  for (const ctx of contexts) {
    if (!isActiveContext(ctx)) continue;

    try {
      const mod = await import(`#BusinessCapabilities/${ctx}/slices/projections.js`);
      // Collect all exported arrays of ProjectionConfig
      for (const value of Object.values(mod)) {
        if (Array.isArray(value)) {
          allProjections.push(...(value as ProjectionConfig[]));
        }
      }
    } catch {
      // This context has no projections.ts — skip
    }
  }

  return allProjections;
}
