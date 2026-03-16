import * as assert from "node:assert";
import type { ProjectionConfig, SqlStatement } from "./ProjectionFactory.js";
import { ProjectionModeType } from "./ProjectionFactory.js";

/**
 * Expected shape of a SQL statement in a projection slice test.
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

export type ExpectedIdempotentSqlQuery = {
  readonly idempotencyKey: string;
  readonly sqlContains: string;
  readonly params: unknown[];
};

/**
 * Generic tester for projections.
 *
 * Mirrors SliceTester for command handler slices:
 *   SliceTester:      given events  + when command  → then emitted events
 *   ProjectionTester: given payload + when message  → then SQL statements
 *
 * No database or Kafka required — handlers are pure functions.
 *
 * Usage (query / transaction mode):
 *   ProjectionTester.test(mySlice, "FundsWithdrawn", payload, [{ sqlContains, params }]);
 *
 * Usage (idempotent mode — also verifies the key extractor on the config):
 *   ProjectionTester.testIdempotent(mySlice, "FundsWithdrawn", payload, { idempotencyKey, sqlContains, params });
 */
export class ProjectionTester {
  static test(
    projection: ProjectionConfig,
    messageType: string,
    payload: Record<string, unknown>,
    expected: ExpectedSqlQuery[] | null,
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
      assert.strictEqual(result, null, `Expected handler for '${messageType}' to return null`);
      return;
    }

    assert.ok(result, `Handler for '${messageType}' returned null, expected SQL statements`);
    assert.strictEqual(
      result.length,
      expected.length,
      `Statement count mismatch for '${messageType}': expected ${expected.length}, got ${result.length}`,
    );

    for (let i = 0; i < expected.length; i++) {
      assertSqlQuery(result[i], expected[i], `${messageType}[${i}]`);
    }
  }

  static testIdempotent(
    projection: ProjectionConfig,
    messageType: string,
    payload: Record<string, unknown>,
    expected: ExpectedIdempotentSqlQuery | null,
  ): void {
    const { mode } = projection;
    assert.ok(
      mode.type === ProjectionModeType.Idempotent,
      `Projection '${projection.projectionName}' is not in idempotent mode`,
    );

    const handler = projection.handlers[messageType];
    assert.ok(
      handler,
      `No handler registered for messageType '${messageType}' in projection '${projection.projectionName}'`,
    );

    const meta = { outboxId: "test-outbox-id", projectionName: projection.projectionName };
    const result = handler(payload, meta);

    if (expected === null) {
      assert.strictEqual(result, null, `Expected handler for '${messageType}' to return null`);
      return;
    }

    assert.ok(result, `Handler for '${messageType}' returned null, expected SQL statements`);

    assert.strictEqual(
      mode.getIdempotencyKey(payload, meta),
      expected.idempotencyKey,
      `idempotencyKey mismatch for '${messageType}'`,
    );

    assert.strictEqual(result.length, 1, `Expected 1 statement from idempotent handler '${messageType}', got ${result.length}`);
    assertSqlQuery(result[0], expected, messageType);
  }
}

function assertSqlQuery(actual: SqlStatement, expected: ExpectedSqlQuery, label: string): void {
  assert.ok(
    actual.sql.toLowerCase().includes(expected.sqlContains.toLowerCase()),
    `SQL should contain "${expected.sqlContains}"\nActual SQL: ${actual.sql}`,
  );

  assert.strictEqual(
    actual.params.length,
    expected.params.length,
    `Param count mismatch for '${label}': expected ${expected.params.length}, got ${actual.params.length}`,
  );

  for (let i = 0; i < expected.params.length; i++) {
    const actualParam: unknown = actual.params[i];
    const exp: unknown = expected.params[i];

    if (typeof exp === "object" && exp !== null) {
      const actualParsed = typeof actualParam === "string" ? JSON.parse(actualParam) : actualParam;
      assert.deepStrictEqual(actualParsed, exp, `Param[${i}] (JSONB) mismatch for '${label}'`);
    } else {
      assert.strictEqual(actualParam, exp, `Param[${i}] mismatch for '${label}'`);
    }
  }
}
