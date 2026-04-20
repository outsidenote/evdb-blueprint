import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getRegisteredAutomations } from "./defineAutomationEndpoint.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { PgBossEndpointConfigBase } from "./PgBossEndpointConfig.js";
import { isActiveContext } from "../activeContext.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BC_DIR = join(__dirname, "..", "..", "BusinessCapabilities");

/**
 * Discovers and imports automation endpoints across active BusinessCapabilities contexts.
 *
 * Convention: each context with automations has a file at
 *   `BusinessCapabilities/<Context>/endpoints/automations.ts`
 * that side-effect imports its pg-boss endpoint modules,
 * triggering their self-registration via defineAutomationEndpoint().
 *
 * After all imports complete, getRegisteredAutomations() returns every endpoint.
 *
 * Filtered by ACTIVE_CONTEXT env var.
 */
export async function discoverAutomations(
  storageAdapter: IEvDbStorageAdapter,
): Promise<PgBossEndpointConfigBase[]> {
  if (!existsSync(BC_DIR)) return [];
  const contexts = await readdir(BC_DIR);

  for (const ctx of contexts) {
    if (!isActiveContext(ctx)) continue;

    try {
      await import(`#BusinessCapabilities/${ctx}/endpoints/automations.js`);
    } catch {
      // This context has no automations.ts — skip
    }
  }

  return getRegisteredAutomations().map((a) => a.create(storageAdapter));
}
