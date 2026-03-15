import * as assert from "node:assert";
import type { ProjectionConfig, SqlQuery, SqlTransaction } from "./ProjectionFactory.js";

function isSqlQuery(result: SqlQuery | SqlTransaction): result is SqlQuery {
  return "sql" in result;
}

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

export type ExpectedSqlTransaction = {
  readonly statements: ExpectedSqlQuery[];
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
 * Usage (SqlQuery):
 *   ProjectionTester.test(mySlice, "FundsWithdrawn", payload, { sqlContains, params });
 *
 * Usage (SqlTransaction):
 *   ProjectionTester.testTransaction(mySlice, "FundsWithdrawn", payload, { statements: [...] });
 */
export class ProjectionTester {
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
      assert.strictEqual(result, null, `Expected handler for '${messageType}' to return null`);
      return;
    }

    assert.ok(result, `Handler for '${messageType}' returned null, expected a SqlQuery`);
    assert.ok(isSqlQuery(result), `Handler for '${messageType}' returned a SqlTransaction — use testTransaction instead`);

    assertSqlQuery(result, expected, messageType);
  }

  static testTransaction(
    projection: ProjectionConfig,
    messageType: string,
    payload: Record<string, unknown>,
    expected: ExpectedSqlTransaction | null,
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

    assert.ok(result, `Handler for '${messageType}' returned null, expected a SqlTransaction`);
    assert.ok(!isSqlQuery(result), `Handler for '${messageType}' returned a SqlQuery — use test instead`);

    assert.strictEqual(
      result.statements.length,
      expected.statements.length,
      `Statement count mismatch for '${messageType}': expected ${expected.statements.length}, got ${result.statements.length}`,
    );

    for (let i = 0; i < expected.statements.length; i++) {
      assertSqlQuery(result.statements[i], expected.statements[i], `${messageType}[${i}]`);
    }
  }
}

function assertSqlQuery(actual: SqlQuery, expected: ExpectedSqlQuery, label: string): void {
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
