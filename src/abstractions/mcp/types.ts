/**
 * Manifest contract published by this BE so an MCP Gateway can discover its
 * tools without scraping internal modules. Versioned via `manifestVersion`.
 *
 * Gateway flow:
 *   GET {service.url}/.well-known/mcp-manifest.json  → McpServiceManifest
 *   For each tool, gateway registers an MCP tool whose handler proxies to
 *   `{service.url}{tool.endpoint.path}` using the tool's `inputSchema` to
 *   validate and serialize the call (body for POST, query string for GET).
 *
 * `service.url` is THIS BE's address as seen by the gateway — never the
 * gateway's URL. Traffic flows only gateway → BE; the BE has no need to
 * know where the gateway lives.
 */

export type McpToolKind = "command" | "query";

export interface McpEndpointBinding {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  inputLocation: "body" | "query";
}

export interface McpToolAnnotations {
  readOnlyHint?: boolean;
  idempotentHint?: boolean;
  destructiveHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpToolDescriptor {
  name: string;
  kind: McpToolKind;
  title: string;
  description: string;
  context?: string;
  slice?: string;
  endpoint: McpEndpointBinding;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: McpToolAnnotations;
  emits?: string[];
}

export interface McpServiceManifest {
  manifestVersion: "1.0";
  service: {
    name: string;
    version: string;
    /** THIS BE's URL as the gateway should call it. Mirrors OpenAPI `servers[].url`. */
    url: string;
    description?: string;
  };
  tools: McpToolDescriptor[];
}
