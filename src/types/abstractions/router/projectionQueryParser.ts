/**
 * Pure parsing and validation for projection query requests.
 *
 * No Express dependency — accepts raw query params as Record<string, unknown>.
 * Returns a discriminated union (`ProjectionQuery`) or throws a `QueryValidationError`.
 */

/**
 * Represents a parsed and validated projection query.
 */
export type ProjectionQuery =
  | { readonly mode: "byKey"; readonly projectionName: string; readonly key: string }
  | { readonly mode: "byKeys"; readonly projectionName: string; readonly keys: string[] }
  | { readonly mode: "betweenKeys"; readonly projectionName: string; readonly from: string; readonly to: string; readonly limit: number; readonly afterKey?: string; readonly fromInclusive: boolean; readonly toInclusive: boolean };


/**
 * Error type for query validation failures.
 */
export class QueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryValidationError";
  }
}


const QUERY_MODE_PARAMS = ["key", "keys", "from", "to"] as const;
const PAGINATION_PARAMS = ["afterKey", "limit"] as const;
const RANGE_OPTION_PARAMS = ["fromInclusive", "toInclusive"] as const;
const ALL_KNOWN_PARAMS = [...QUERY_MODE_PARAMS, ...PAGINATION_PARAMS, ...RANGE_OPTION_PARAMS] as const;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

/**
 * 
 * @param projectionName 
 * @param rawParams 
 * @returns 
 */
export function parseProjectionQuery(
  projectionName: string,
  rawParams: Record<string, unknown>,
): ProjectionQuery {
  validateProjectionName(projectionName);
  rejectUnknownParams(rawParams);
  rejectArrayParams(rawParams);

  const mode = detectMode(rawParams);
  const limit = parseLimit(rawParams);
  const afterKey = parseOptionalString(rawParams, "afterKey");

  switch (mode) {
    case "byKey": {
      rejectPaginationParams(rawParams);
      const key = parseRequiredString(rawParams, "key");
      return { mode: "byKey", projectionName, key };
    }
    case "byKeys": {
      rejectPaginationParams(rawParams);
      const keys = parseKeys(rawParams);
      return { mode: "byKeys", projectionName, keys };
    }
    case "betweenKeys": {
      const from = parseRequiredString(rawParams, "from");
      const to = parseRequiredString(rawParams, "to");
      const fromInclusive = parseOptionalBoolean(rawParams, "fromInclusive") ?? true;
      const toInclusive = parseOptionalBoolean(rawParams, "toInclusive") ?? false;
      return { mode: "betweenKeys", projectionName, from, to, limit, afterKey, fromInclusive, toInclusive };
    }
  }
}


type QueryMode = "byKey" | "byKeys" | "betweenKeys";

function detectMode(params: Record<string, unknown>): QueryMode {
  const hasKey = has(params, "key");
  const hasKeys = has(params, "keys");
  const hasFrom = has(params, "from");
  const hasTo = has(params, "to");

  const modeCount =
    (hasKey ? 1 : 0) +
    (hasKeys ? 1 : 0) +
    (hasFrom || hasTo ? 1 : 0);

  if (modeCount === 0) {
    throw new QueryValidationError(
      "Provide one of: ?key=<key>, ?keys=<k1>,<k2>, ?from=<start>&to=<end>",
    );
  }

  if (modeCount > 1) {
    throw new QueryValidationError(
      "Query parameters are mutually exclusive: use only one of key, keys, or from+to",
    );
  }

  if (hasKey) return "byKey";
  if (hasKeys) return "byKeys";

  if (hasFrom && !hasTo) throw new QueryValidationError("'from' requires 'to'");
  if (!hasFrom && hasTo) throw new QueryValidationError("'to' requires 'from'");

  return "betweenKeys";
}


function parseRequiredString(params: Record<string, unknown>, name: string): string {
  const value = params[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new QueryValidationError(`'${name}' must be a non-empty string`);
  }
  return value.trim();
}

function parseOptionalString(params: Record<string, unknown>, name: string): string | undefined {
  const value = params[name];
  if (value == null) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new QueryValidationError(`'${name}' must be a non-empty string when provided`);
  }
  return value.trim();
}

function parseOptionalBoolean(params: Record<string, unknown>, name: string): boolean | undefined {
  const value = params[name];
  if (value == null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new QueryValidationError(`'${name}' must be 'true' or 'false'`);
}

function parseKeys(params: Record<string, unknown>): string[] {
  const raw = parseRequiredString(params, "keys");
  const keys = raw.split(",").map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) {
    throw new QueryValidationError("'keys' must contain at least one non-empty key");
  }
  return keys;
}

function parseLimit(params: Record<string, unknown>): number {
  const raw = params["limit"];
  if (raw == null) return DEFAULT_LIMIT;

  if (typeof raw !== "string") {
    throw new QueryValidationError("'limit' must be a string-encoded positive integer");
  }

  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new QueryValidationError("'limit' must be a positive integer");
  }

  if (parsed > MAX_LIMIT) {
    throw new QueryValidationError(`'limit' must not exceed ${MAX_LIMIT}`);
  }

  return parsed;
}


function validateProjectionName(name: string): void {
  if (name.trim().length === 0) {
    throw new QueryValidationError("projectionName must not be empty");
  }
}

function rejectUnknownParams(params: Record<string, unknown>): void {
  const known = new Set<string>(ALL_KNOWN_PARAMS);
  for (const key of Object.keys(params)) {
    if (!known.has(key)) {
      throw new QueryValidationError(`Unknown query parameter: '${key}'`);
    }
  }
}

function rejectArrayParams(params: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      throw new QueryValidationError(`Parameter '${name}' must not be repeated`);
    }
  }
}

function rejectPaginationParams(params: Record<string, unknown>): void {
  if (has(params, "afterKey")) {
    throw new QueryValidationError("'afterKey' is not supported for this query mode");
  }
  if (has(params, "limit")) {
    throw new QueryValidationError("'limit' is not supported for this query mode");
  }
}


export function nextAfterKey(items: Array<{ key: string }>): string | undefined {
  if (items.length === 0) return undefined;
  return items[items.length - 1].key;
}


function has(params: Record<string, unknown>, key: string): boolean {
  return params[key] != null;
}
