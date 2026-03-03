import { setTimeout as delay } from "node:timers/promises";

/**
 * Polls a predicate until it returns true or the timeout expires.
 * Throws if the predicate never becomes true within the timeout.
 */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 10_000,
  intervalMs = 200,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(intervalMs);
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}
