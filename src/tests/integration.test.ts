import { test, describe, before, after } from "node:test";
import * as assert from "node:assert";
import request from "supertest";
import type express from "express";
import { TestDatabase, createTestApp, waitFor } from "./harness/index.js";
import { createFundsWithdrawalApprovedWorker } from "../BusinessCapabilities/Funds/endpoints/CalculateWithdrawComission/pg-boss/index.js";
import { createWithdrawalRouter } from "../routes/withdrawal.js";

describe("E2E: CalculateWithdrawCommission worker pipeline", () => {
  const db = new TestDatabase();
  let app: express.Express;

  before(async () => {
    await db.start();
    ({ app } = await createTestApp(db, {
      workers: (storageAdapter) => [
        createFundsWithdrawalApprovedWorker(storageAdapter),
      ],
      routes: (app, storageAdapter) => {
        app.use("/api/withdrawals", createWithdrawalRouter(storageAdapter));
      },
    }));
  });

  after(async () => {
    await db.stop();
  });

  // ──────────────────────────────────────────────────────────────────
  // Worker pipeline: command → outbox → trigger → pg-boss → worker
  //                  → downstream events
  // ──────────────────────────────────────────────────────────────────
  test("worker pipeline: command triggers worker, creates downstream events", async () => {
    const account = "e2e-account-001";

    // GIVEN: A command that produces an outbox message
    const res = await request(app)
      .post("/api/withdrawals/approve")
      .send({
        account,
        amount: 0,
        currency: "USD",
        session: "e2e-session",
        source: "e2e-test",
        payer: "E2E Payer",
        transactionId: "e2e-txn-001",
        transactionTime: "2025-06-01T10:00:00Z",
        approvalDate: "2025-06-01T10:00:00Z",
      });
    assert.strictEqual(res.status, 200);

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
  test("worker idempotency: duplicate job with same outboxId does not create duplicate events", async () => {
    const account = "e2e-account-002";

    // GIVEN: A command that produces an outbox message and worker processes it
    const res = await request(app)
      .post("/api/withdrawals/approve")
      .send({
        account,
        amount: 0,
        currency: "EUR",
        session: "e2e-session",
        source: "e2e-test",
        payer: "E2E Payer",
        transactionId: "e2e-txn-002",
      });
    assert.strictEqual(res.status, 200);

    const { rows: outboxRows } = await db.client.query(
      "SELECT id FROM public.outbox WHERE stream_id = $1 AND channel = 'pg-boss'",
      [account],
    );
    assert.ok(outboxRows.length > 0, "Expected outbox row");
    const outboxId = outboxRows[0].id;

    await waitFor(async () => {
      const { rows } = await db.client.query(
        "SELECT * FROM public.processed_jobs WHERE idempotency_key = $1",
        [outboxId],
      );
      return rows.length > 0;
    });

    // Snapshot: count downstream events scoped to this account
    const { rows: eventsBefore } = await db.client.query(
      "SELECT count(*)::int AS cnt FROM public.events WHERE stream_id = $1 AND event_type = 'WithdrawCommissionCalculated'",
      [account],
    );

    // WHEN: Simulate pg-boss redelivery
    const { rows: jobRows } = await db.client.query(
      "SELECT name FROM pgboss.job WHERE data->'metadata'->>'outboxId' = $1 LIMIT 1",
      [outboxId],
    );
    assert.ok(jobRows.length > 0, "Expected pg-boss job for redelivery test");

    await db.boss.send(jobRows[0].name, {
      metadata: { outboxId },
      payload: { account, amount: 0, currency: "EUR" },
    });

    // Wait for the duplicate job to be handled
    await waitFor(async () => {
      const { rows } = await db.client.query(
        "SELECT count(*)::int AS cnt FROM public.processed_jobs WHERE idempotency_key = $1",
        [outboxId],
      );
      return rows[0].cnt > 0;
    });

    // THEN: No additional downstream events for this account
    const { rows: eventsAfter } = await db.client.query(
      "SELECT count(*)::int AS cnt FROM public.events WHERE stream_id = $1 AND event_type = 'WithdrawCommissionCalculated'",
      [account],
    );
    assert.strictEqual(eventsAfter[0].cnt, eventsBefore[0].cnt, "No duplicate events from redelivery");
  });
});
