import { test, describe, before, after } from "node:test";
import * as assert from "node:assert";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { TestDatabase } from "./harness/index.js";
import { pendingWithdrawalLookupSlice } from "../BusinessCapabilities/Funds/slices/PendingWithdrawalLookup/index.js";

describe("Projection integration: PendingWithdrawalLookup", () => {
  const db = new TestDatabase();
  let pool: Pool;

  before(async () => {
    await db.start();
    pool = new Pool({ connectionString: db.connectionUri });
  });

  after(async () => {
    await pool.end();
    await db.stop();
  });

  // ── Helpers ────────────────────────────────────────────────────

  async function runHandler(
    messageType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const handler = pendingWithdrawalLookupSlice.handlers[messageType];
    const statements = handler(payload, {
      outboxId: randomUUID(),
      projectionName: pendingWithdrawalLookupSlice.projectionName,
    });
    if (!statements) return;
    for (const stmt of statements) {
      await pool.query(stmt.sql, stmt.params);
    }
  }

  async function getRow(account: string) {
    const { rows } = await pool.query(
      `SELECT name, key, payload, created_at, updated_at
       FROM projections WHERE name = $1 AND key = $2`,
      [pendingWithdrawalLookupSlice.projectionName, account],
    );
    return rows[0] ?? null;
  }

  // ── INSERT ─────────────────────────────────────────────────────

  test("FundsWithdrawalApproved: creates a projection row", async () => {
    const account = `proj-${randomUUID()}`;

    await runHandler("FundsWithdrawalApproved", {
      account,
      currency: "USD",
      amount: 100,
      transactionId: "txn-1",
    });

    const row = await getRow(account);
    assert.ok(row, "Projection row should exist after FundsWithdrawalApproved");
    assert.strictEqual(row.key, account);
    assert.strictEqual(row.payload.account, account);
    assert.strictEqual(row.payload.currency, "USD");
    assert.strictEqual(row.payload.amount, 100);
    assert.strictEqual(row.payload.transactionId, "txn-1");
  });

  // ── UPSERT idempotency ─────────────────────────────────────────

  test("FundsWithdrawalApproved (second time): updates existing row without creating a duplicate", async () => {
    const account = `proj-upsert-${randomUUID()}`;

    await runHandler("FundsWithdrawalApproved", { account, currency: "USD", amount: 100, transactionId: "txn-1" });
    const rowAfterFirst = await getRow(account);

    await runHandler("FundsWithdrawalApproved", { account, currency: "EUR", amount: 200, transactionId: "txn-2" });
    const rowAfterSecond = await getRow(account);

    // Still one row
    const { rows: allRows } = await pool.query(
      `SELECT * FROM projections WHERE name = $1 AND key = $2`,
      [pendingWithdrawalLookupSlice.projectionName, account],
    );
    assert.strictEqual(allRows.length, 1, "UPSERT must not create a duplicate row");

    // Payload updated
    assert.strictEqual(rowAfterSecond.payload.amount, 200);
    assert.strictEqual(rowAfterSecond.payload.currency, "EUR");

    // created_at unchanged, updated_at advanced
    assert.deepStrictEqual(rowAfterSecond.created_at, rowAfterFirst.created_at);
    assert.ok(
      rowAfterSecond.updated_at >= rowAfterFirst.updated_at,
      "updated_at should advance on re-upsert",
    );
  });

  // ── DELETE on withdrawal ────────────────────────────────────────

  test("FundsWithdrawn: removes the projection row", async () => {
    const account = `proj-withdrawn-${randomUUID()}`;

    await runHandler("FundsWithdrawalApproved", { account, currency: "USD", amount: 100, transactionId: "txn-1" });
    assert.ok(await getRow(account), "Row should exist after approval");

    await runHandler("FundsWithdrawn", { account });
    assert.strictEqual(await getRow(account), null, "Row should be removed after FundsWithdrawn");
  });

  // ── DELETE safety (no row exists) ─────────────────────────────

  test("FundsWithdrawn with no prior row: does not throw", async () => {
    const account = `proj-ghost-${randomUUID()}`;
    await assert.doesNotReject(
      () => runHandler("FundsWithdrawn", { account }),
      "DELETE on non-existent row should be a no-op",
    );
  });

  // ── Isolation between projections ─────────────────────────────

  test("DELETE only removes the matching projection name and key", async () => {
    const account = `proj-iso-${randomUUID()}`;

    // Insert using a different projection name directly
    await pool.query(
      `INSERT INTO projections (name, key, payload) VALUES ($1, $2, $3::jsonb)`,
      ["OtherProjection", account, JSON.stringify({ note: "should survive" })],
    );

    await runHandler("FundsWithdrawalApproved", { account, currency: "USD", amount: 50, transactionId: "txn-s" });
    await runHandler("FundsWithdrawn", { account });

    // PendingWithdrawalLookup row gone
    assert.strictEqual(await getRow(account), null);

    // OtherProjection row untouched
    const { rows } = await pool.query(
      `SELECT * FROM projections WHERE name = 'OtherProjection' AND key = $1`,
      [account],
    );
    assert.strictEqual(rows.length, 1, "DELETE must not affect other projection names");
  });
});
