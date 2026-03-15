import * as assert from "node:assert";
import type { ProjectionConfig, SqlStatement, SqlQuery, SqlTransaction, IdempotentSqlQuery } from "./ProjectionFactory.js";

function isSqlQuery(result: SqlQuery | SqlTransaction | IdempotentSqlQuery): result is SqlQuery {
  return result.type === "query";
}

function isIdempotentSqlQuery(result: SqlQuery | SqlTransaction | IdempotentSqlQuery): result is IdempotentSqlQuery {
  return result.type === "idempotent";
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
 *   ProjectionTester: given payload + when message  → then SQL query
 *
 * No database or Kafka required — handlers are pure functions.
 *
 * Usage (SqlQuery):
 *   ProjectionTester.test(mySlice, "FundsWithdrawn", payload, { sqlContains, params });
 *
 * Usage (IdempotentSqlQuery):
 *   ProjectionTester.testIdempotent(mySlice, "FundsWithdrawn", payload, { idempotencyKey, sqlContains, params });
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
    assert.ok(isSqlQuery(result), `Handler for '${messageType}' returned a SqlTransaction or IdempotentSqlQuery — use testTransaction or testIdempotent instead`);

    assertSqlQuery(result, expected, messageType);
  }

  static testIdempotent(
    projection: ProjectionConfig,
    messageType: string,
    payload: Record<string, unknown>,
    expected: ExpectedIdempotentSqlQuery | null,
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

    assert.ok(result, `Handler for '${messageType}' returned null, expected an IdempotentSqlQuery`);
    assert.ok(isIdempotentSqlQuery(result), `Handler for '${messageType}' did not return an IdempotentSqlQuery — use test or testTransaction instead`);

    assert.strictEqual(result.idempotencyKey, expected.idempotencyKey, `idempotencyKey mismatch for '${messageType}'`);
    assertSqlQuery({ sql: result.sql, params: result.params }, expected, messageType);
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
    assert.ok(result.type === "transaction", `Handler for '${messageType}' did not return a SqlTransaction — use test or testIdempotent instead`);

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
