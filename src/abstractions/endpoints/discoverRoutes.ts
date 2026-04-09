import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Router } from "express";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BC_DIR = join(__dirname, "..", "..", "BusinessCapabilities");

export interface RouteConfig {
  basePath: string;
  createRouter: (storageAdapter: IEvDbStorageAdapter) => Router;
}

/**
 * Discovers all REST route configs across all BusinessCapabilities contexts.
 *
 * Convention: each context with REST routes has a file at
 *   `BusinessCapabilities/<Context>/endpoints/routes.ts`
 * that exports a `routeConfig` of type RouteConfig.
 */
export async function discoverRoutes(): Promise<RouteConfig[]> {
  const contexts = await readdir(BC_DIR);
  const allRoutes: RouteConfig[] = [];

  for (const ctx of contexts) {
    try {
      const mod = await import(`#BusinessCapabilities/${ctx}/endpoints/routes.js`);
      if (mod.routeConfig) {
        allRoutes.push(mod.routeConfig as RouteConfig);
      }
    } catch {
      // This context has no routes.ts — skip
    }
  }

  return allRoutes;
}
