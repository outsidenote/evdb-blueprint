import type { McpToolAnnotations, McpToolDescriptor } from "./types.js";

/**
 * Per-slice helpers for declaring MCP tool descriptors. Slices import these
 * to keep their `*.mcp.ts` / `MCP/index.ts` files small and consistent — the
 * abstraction handles endpoint binding shape, default annotations, and the
 * shared projection input/output schemas.
 *
 * New slice → new descriptor file. The abstraction is never edited.
 */

export function defineCommandMcpTool(args: {
  name: string;
  title: string;
  description: string;
  context: string;
  slice: string;
  basePath: string;
  routePath: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  emits?: string[];
  annotations?: McpToolAnnotations;
}): McpToolDescriptor {
  return {
    name: args.name,
    kind: "command",
    title: args.title,
    description: args.description,
    context: args.context,
    slice: args.slice,
    endpoint: {
      method: "POST",
      path: `${args.basePath}${args.routePath}`,
      inputLocation: "body",
    },
    inputSchema: args.inputSchema,
    outputSchema: args.outputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      ...args.annotations,
    },
    emits: args.emits,
  };
}


export const projectionQueryInputSchema: Record<string, unknown> = {
  type: "object",
  oneOf: [
    {
      title: "byKey",
      required: ["key"],
      additionalProperties: false,
      properties: { key: { type: "string", description: "Single projection key" } },
    },
    {
      title: "byKeys",
      required: ["keys"],
      additionalProperties: false,
      properties: {
        keys: { type: "array", items: { type: "string" }, minItems: 1 },
      },
    },
    {
      title: "byPrefix",
      required: ["prefix"],
      additionalProperties: false,
      properties: {
        prefix: { type: "string", description: "Key prefix to scan" },
        limit: { type: "integer", minimum: 1, maximum: 1000 },
        afterKey: { type: "string", description: "Pagination cursor (opaque)" },
      },
    },
    {
      title: "betweenKeys",
      required: ["from", "to"],
      additionalProperties: false,
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        fromInclusive: { type: "boolean", default: true },
        toInclusive: { type: "boolean", default: true },
        limit: { type: "integer", minimum: 1, maximum: 1000 },
        afterKey: { type: "string" },
      },
    },
  ],
};


export const projectionOutputSchema: Record<string, unknown> = {
  type: "object",
  oneOf: [
    {
      required: ["item"],
      properties: { item: { type: "object" } },
    },
    {
      required: ["items"],
      properties: {
        items: { type: "array", items: { type: "object" } },
        nextAfterKey: { type: "string" },
      },
    },
  ],
};


export function defineProjectionMcpTool(args: {
  name: string;
  title: string;
  description: string;
  context: string;
  slice: string;
  projectionName: string;
}): McpToolDescriptor {
  return {
    name: args.name,
    kind: "query",
    title: args.title,
    description: args.description,
    context: args.context,
    slice: args.slice,
    endpoint: {
      method: "GET",
      path: `/api/projections/${args.projectionName}`,
      inputLocation: "query",
    },
    inputSchema: projectionQueryInputSchema,
    outputSchema: projectionOutputSchema,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  };
}
