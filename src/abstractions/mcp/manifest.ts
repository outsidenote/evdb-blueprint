import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverMcpTools } from "./discoverMcpTools.js";
import type { McpServiceManifest } from "./types.js";

/**
 * Assembles the MCP service manifest published at /.well-known/mcp-manifest.json.
 *
 * Tool descriptors live next to their slices (`endpoints/<Cmd>/MCP/index.ts`
 * for commands, `slices/<Projection>/mcp.ts` for queries) and are aggregated
 * per-context in `endpoints/mcpTools.ts`. This module performs no per-slice
 * work — it only walks active contexts via `discoverMcpTools` and wraps the
 * result in a service envelope.
 *
 * `serviceUrl` is THIS BE's externally-callable URL (as the gateway will
 * reach it), never the gateway's URL.
 *
 * Service identity (`name`/`version`/`description`) resolves in this order
 * so the same code can be dropped into another project unchanged:
 *   1. Env var (per-deployment override): MCP_SERVICE_NAME / _VERSION / _DESCRIPTION
 *   2. Project package.json: name / version / description
 *   3. Hard-coded fallback (only when package.json is missing or malformed)
 */

interface PackageMeta {
  name?: string;
  version?: string;
  description?: string;
}

function loadPackageMeta(): PackageMeta {
  // src/abstractions/mcp/manifest.ts → ../../../package.json
  // dist/abstractions/mcp/manifest.js → ../../../package.json (same depth)
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, "..", "..", "..", "package.json");
    const parsed = JSON.parse(readFileSync(pkgPath, "utf-8")) as PackageMeta;
    return {
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      version: typeof parsed.version === "string" ? parsed.version : undefined,
      description: typeof parsed.description === "string" ? parsed.description : undefined,
    };
  } catch {
    return {};
  }
}

const PACKAGE_META = loadPackageMeta();

export async function buildMcpManifest(serviceUrl: string): Promise<McpServiceManifest> {
  const tools = await discoverMcpTools();

  const name = process.env.MCP_SERVICE_NAME ?? PACKAGE_META.name ?? "evdb-service";
  const version = process.env.MCP_SERVICE_VERSION ?? PACKAGE_META.version ?? "0.0.0";
  const description = process.env.MCP_SERVICE_DESCRIPTION ?? PACKAGE_META.description;

  return {
    manifestVersion: "1.0",
    service: {
      name,
      version,
      url: serviceUrl,
      ...(description ? { description } : {}),
    },
    tools,
  };
}
