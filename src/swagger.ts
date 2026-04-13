import type { RouteConfig } from "./abstractions/endpoints/discoverRoutes.js";

const BASE_DOC = {
  openapi: "3.0.3",
  info: {
    title: "EVDB Blueprint API",
    description: "Event-sourced CQRS API — powered by eventualize-js",
    version: "1.0.0",
  },
  paths: {
    "/api/projections/{projectionName}": {
      get: {
        summary: "Query a projection",
        tags: ["Projections"],
        parameters: [
          { name: "projectionName", in: "path", required: true, schema: { type: "string" } },
          { name: "key", in: "query", schema: { type: "string" }, description: "Single key lookup" },
          { name: "keys", in: "query", schema: { type: "string" }, description: "Comma-separated keys" },
          { name: "prefix", in: "query", schema: { type: "string" }, description: "Key prefix lookup (e.g. prefix=PORT-1: returns all keys starting with PORT-1:)" },
          { name: "from", in: "query", schema: { type: "string" }, description: "Range start" },
          { name: "to", in: "query", schema: { type: "string" }, description: "Range end" },
          { name: "afterKey", in: "query", schema: { type: "string" }, description: "Pagination cursor" },
          { name: "limit", in: "query", schema: { type: "integer" }, description: "Max rows (default 100, max 1000)" },
        ],
        responses: {
          "200": { description: "Projection data returned" },
          "400": { description: "Invalid query parameters" },
          "404": { description: "Projection not found" },
        },
      },
    },
  } as Record<string, unknown>,
  components: {
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: { error: { type: "string" } },
      },
    },
  },
};

/**
 * Build the full OpenAPI document by merging swagger specs from all discovered routes.
 * Called at startup after discoverRoutes().
 */
export function buildSwaggerDocument(routeConfigs: RouteConfig[]): typeof BASE_DOC {
  const doc = structuredClone(BASE_DOC);

  for (const route of routeConfigs) {
    if (route.swagger) {
      Object.assign(doc.paths, route.swagger);
    }
  }

  return doc;
}
