import * as assert from "node:assert";
import type { ProjectionConfig } from "./ProjectionFactory.js";

/**
 * Expected shape of a SQL query in a projection slice test.
 *
 * - `sqlContains`: case-insensitive substring — avoids brittle whitespace/newline matching
 * - `params`: scalar values compared with strictEqual;
 *             object values are compared against the parsed JSONB string (deepStrictEqual),
 *             so tests can write `{ account: "x" }` instead of `JSON.stringify({ account: "x" })`
 */
export type ExpectedSqlQuery = {
  readonly sqlContains: string;
  readonly params: unknown[];
};

/**
 * Generic tester for projections.
 *
 * Mirrors SliceTester for command handler slices:
 *   SliceTester:      given events  + when command  → then emitted events
 *   ProjectionTester: given payload + when message  → then SQL query
 *
 * No database or Kafka required — handlers are pure functions.
 *
 * Usage:
 *   ProjectionTester.test(
 *     mySlice,
 *     "FundsWithdrawn",
 *     { account: "acc-1", currency: "USD", amount: 100, session: "s1" },
 *     {
 *       sqlContains: "INSERT INTO projections",
 *       params: ["MyProjection", "acc-1", { account: "acc-1", currency: "USD", amount: 100, session: "s1" }],
 *     },
 *   );
 */
export class ProjectionTester {
  /**
   * @param projection  The projection config under test.
   * @param messageType The Kafka message type (key in `projection.handlers`).
   * @param payload     The message payload (GIVEN).
   * @param expected    The expected SQL query (THEN), or null if the handler should ignore the message.
   */
  static test(
    projection: ProjectionConfig,
    messageType: string,
    payload: Record<string, unknown>,
    expected: ExpectedSqlQuery | null,
  ): void {
    const handler = projection.handlers[messageType];
    assert.ok(
      handler,
      `No handler registered for messageType '${messageType}' in projection '${projection.projectionName}'`,
    );

    const result = handler(payload, {
      outboxId: "test-outbox-id",
      projectionName: projection.projectionName,
    });

    if (expected === null) {
      assert.strictEqual(
        result,
        null,
        `Expected handler for '${messageType}' to return null (ignore message)`,
      );
      return;
    }

    assert.ok(
      result,
      `Handler for '${messageType}' returned null, expected a SqlQuery`,
    );

    // SQL: case-insensitive substring match (tolerant of whitespace/formatting)
    assert.ok(
      result.sql.toLowerCase().includes(expected.sqlContains.toLowerCase()),
      `SQL should contain "${expected.sqlContains}"\nActual SQL: ${result.sql}`,
    );

    // Params: length check first, then element-by-element
    assert.strictEqual(
      result.params.length,
      expected.params.length,
      `Param count mismatch for '${messageType}': expected ${expected.params.length}, got ${result.params.length}`,
    );

    for (let i = 0; i < expected.params.length; i++) {
      const actual: unknown = result.params[i];
      const exp = expected.params[i];

      if (typeof exp === "object" && exp !== null) {
        // Object expected → actual param is a JSONB string, parse it first
        const actualParsed = typeof actual === "string" ? JSON.parse(actual) : actual;
        assert.deepStrictEqual(
          actualParsed,
          exp,
          `Param[${i}] (JSONB) mismatch for '${messageType}'`,
        );
      } else {
        assert.strictEqual(actual, exp, `Param[${i}] mismatch for '${messageType}'`);
      }
    }
  }
}
