import { test, describe, before, after } from "node:test";
import * as assert from "node:assert";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { TestDatabase, createTestApp, waitFor } from "./harness/index.js";
import { createFundsWithdrawalApprovedWorker, QUEUE_NAME } from "../BusinessCapabilities/Funds/endpoints/CalculateWithdrawComission/pg-boss/index.js";
import { createWithdrawCommissionCalculatedWorker } from "../BusinessCapabilities/Funds/endpoints/WithdrawFunds/pg-boss/index.js";

describe("E2E: CalculateWithdrawCommission automation slice", () => {
  const db = new TestDatabase();
  let pool: pg.Pool;

  before(async () => {
    await db.start();
    const app = await createTestApp(db, {
      workers: (storageAdapter) => [
        createFundsWithdrawalApprovedWorker(storageAdapter),
        createWithdrawCommissionCalculatedWorker(storageAdapter),
      ],
    });
    pool = app.pool;
  });

  after(async () => {
    await pool?.end();
    await db.stop();
  });

  /**
   * Inserts an outbox row that the trigger will pick up and deliver to pg-boss.
   */
  async function insertOutboxMessage(account: string, payload: Record<string, unknown>): Promise<string> {
    const outboxId = randomUUID();
    await db.client.query(
      `INSERT INTO public.outbox
        (id, stream_type, stream_id, "offset", event_type, channel, message_type, serialize_type, captured_by, captured_at, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)`,
      [
        outboxId,
        "FundsWithdrawalStream",
        account,
        0,
        "FundsWithdrawalApproved",
        "pg-boss",
        "FundsWithdrawalApproved",
        "json",
        "integration-test",
        JSON.stringify({ queues: [QUEUE_NAME], ...payload }),
      ],
    );
    return outboxId;
  }

  // ──────────────────────────────────────────────────────────────────
  // Worker pipeline: outbox INSERT → trigger → pg-boss → worker
  //                  → downstream events
  // ──────────────────────────────────────────────────────────────────
  test("worker pipeline: outbox message triggers worker, creates downstream events", async () => {
    const account = "e2e-account-001";

    // GIVEN: An outbox message for this automation slice
    await insertOutboxMessage(account, { account, amount: 0, currency: "USD", transactionId: randomUUID() });

    // THEN: Downstream events were created for this account
    await waitFor(async () => {
      const { rows } = await db.client.query(
        "SELECT event_type FROM public.events WHERE stream_id = $1 AND event_type = 'WithdrawCommissionCalculated'",
        [account],
      );
      return rows.length > 0;
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Worker idempotency: duplicate pg-boss job does not create
  // duplicate downstream events
  // ──────────────────────────────────────────────────────────────────
  test("worker idempotency: duplicate job with same transactionId does not create duplicate events", async () => {
    const account = "e2e-account-002";
    const transactionId = randomUUID();

    await db.boss.send(QUEUE_NAME, {
      metadata: { outboxId: randomUUID() },
      payload: { account, amount: 0, currency: "EUR", transactionId },
    });

    // Wait for the first job to be processed (event appears in stream)
    await waitFor(async () => {
      const { rows } = await db.client.query(
        "SELECT count(*)::int AS cnt FROM public.events WHERE stream_id = $1 AND event_type = 'WithdrawCommissionCalculated'",
        [account],
      );
      return rows[0].cnt > 0;
    });

    // Snapshot: count downstream events scoped to this account
    const { rows: eventsBefore } = await db.client.query(
      "SELECT count(*)::int AS cnt FROM public.events WHERE stream_id = $1 AND event_type = 'WithdrawCommissionCalculated'",
      [account],
    );
    // WHEN: Simulate pg-boss redelivery with the same transactionId
    await db.boss.send(QUEUE_NAME, {
      metadata: { outboxId: randomUUID() },
      payload: { account, amount: 0, currency: "EUR", transactionId },
    });

    // Wait for the duplicate job to be handled
    await waitFor(async () => {
      const { rows } = await db.client.query(
        "SELECT count(*)::int AS cnt FROM pgboss.job WHERE name = $1 AND state = 'completed'",
        [QUEUE_NAME],
      );
      // At least 2 jobs completed (original + duplicate)
      return rows[0].cnt >= 2;
    });

    // THEN: No additional downstream events for this account
    const { rows: eventsAfter } = await db.client.query(
      "SELECT count(*)::int AS cnt FROM public.events WHERE stream_id = $1 AND event_type = 'WithdrawCommissionCalculated'",
      [account],
    );
    assert.strictEqual(eventsAfter[0].cnt, eventsBefore[0].cnt, "No duplicate events from redelivery");

    // THEN: Idempotency marker exists in outbox (written atomically by stream message handler)
    // Key is derived from business identifier (transactionId) + consumer name
    const CONSUMER_ID = "CalculateWithdrawCommission";
    const { rows: idempotencyRows } = await db.client.query(
      "SELECT event_type, message_type, payload FROM public.outbox WHERE channel = 'idempotent' AND payload->>'idempotencyKey' = $1",
      [`${transactionId}:${CONSUMER_ID}`],
    );
    assert.strictEqual(idempotencyRows.length, 1, "Idempotency marker exists in outbox");
    assert.strictEqual(idempotencyRows[0].event_type, "WithdrawCommissionCalculated");
    assert.strictEqual(idempotencyRows[0].message_type, `${CONSUMER_ID}.IdempotencyKeyAddedForConsumer`);
    assert.strictEqual(idempotencyRows[0].payload.consumerId, CONSUMER_ID);
  });
});
