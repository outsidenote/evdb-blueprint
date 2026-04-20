/**
 * Resolves which business contexts are active for this instance.
 *
 * Set ACTIVE_CONTEXT env var to control:
 *   ACTIVE_CONTEXT=Funds          — only Funds
 *   ACTIVE_CONTEXT=Funds,Account  — Funds and Account
 *   ACTIVE_CONTEXT=*              — all contexts (default)
 */

const raw = process.env.ACTIVE_CONTEXT || "*";
const activeContexts = raw.split(",").map((s) => s.trim());
const loadAll = activeContexts[0] === "*";

export function isActiveContext(ctx: string): boolean {
  return loadAll || activeContexts.includes(ctx);
}

export function getActiveContextLabel(): string {
  return raw;
}
