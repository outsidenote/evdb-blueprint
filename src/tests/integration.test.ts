import { test, describe, before, after } from "node:test";
import * as assert from "node:assert";
import request from "supertest";
import type express from "express";
import { TestDatabase, createTestApp, waitFor } from "./harness/index.js";

describe("E2E: Withdrawal → Outbox → pg-boss → Worker", () => {
  const db = new TestDatabase();
  let app: express.Express;

  before(async () => {
    await db.start();
    ({ app } = await createTestApp(db));
  });

  after(async () => {
    await db.stop();
  });

  // ──────────────────────────────────────────────────────────────────
  // REST endpoint: POST /approve emits approval events
  // ──────────────────────────────────────────────────────────────────
  test("REST endpoint: POST /approve returns emitted events", async () => {
    const account = "e2e-account-001";

    // WHEN: Call the REST endpoint
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

    // THEN: Returns success with emitted event types
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.streamId, account);
    assert.ok(res.body.emittedEventTypes.length > 0, "Expected at least one emitted event");

    // THEN: Events were persisted
    const { rows: events } = await db.client.query(
      "SELECT event_type FROM public.events WHERE stream_id = $1",
      [account],
    );
    assert.ok(events.length > 0, "Expected events in the database");
  });

  // ──────────────────────────────────────────────────────────────────
  // Outbox trigger: approval creates pg-boss outbox row
  // ──────────────────────────────────────────────────────────────────
  test("outbox trigger: approval creates outbox row with channel='pg-boss'", async () => {
    const account = "e2e-account-001";

    // THEN: Outbox row exists with correct channel
    const { rows: outboxRows } = await db.client.query(
      "SELECT id, channel FROM public.outbox WHERE stream_id = $1 AND channel = 'pg-boss'",
      [account],
    );
    assert.ok(outboxRows.length > 0, "Expected outbox row with channel='pg-boss'");
  });

  // ──────────────────────────────────────────────────────────────────
  // Worker pipeline: outbox → trigger → pg-boss → worker → commission
  // ──────────────────────────────────────────────────────────────────
  test("worker pipeline: outbox trigger fires pg-boss job, worker creates commission events", async () => {
    const account = "e2e-account-001";

    // GIVEN: Outbox row from the previous test
    const { rows: outboxRows } = await db.client.query(
      "SELECT id FROM public.outbox WHERE stream_id = $1 AND channel = 'pg-boss'",
      [account],
    );
    assert.ok(outboxRows.length > 0, "Expected outbox row");
    const outboxId = outboxRows[0].id;

    // THEN: Worker processes the job (idempotency row appears)
    await waitFor(async () => {
      const { rows } = await db.client.query(
        "SELECT * FROM public.processed_jobs WHERE idempotency_key = $1",
        [outboxId],
      );
      return rows.length > 0;
    });

    // THEN: Commission events were created for this account
    const { rows: commissionEvents } = await db.client.query(
      "SELECT event_type FROM public.events WHERE stream_id = $1 AND event_type = 'WithdrawCommissionCalculated'",
      [account],
    );
    assert.ok(commissionEvents.length > 0, "Expected commission events created by worker");
  });

  // ──────────────────────────────────────────────────────────────────
  // Worker idempotency: duplicate pg-boss job does not create
  // duplicate events
  // ──────────────────────────────────────────────────────────────────
  test("worker idempotency: duplicate pg-boss job with same outboxId does not create duplicate events", async () => {
    const account = "e2e-account-002";

    // GIVEN: Approval succeeds and worker processes the job
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

    // Snapshot: count commission events scoped to this account
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

    // THEN: No additional commission events for this account
    const { rows: eventsAfter } = await db.client.query(
      "SELECT count(*)::int AS cnt FROM public.events WHERE stream_id = $1 AND event_type = 'WithdrawCommissionCalculated'",
      [account],
    );
    assert.strictEqual(eventsAfter[0].cnt, eventsBefore[0].cnt, "No duplicate events from redelivery");
  });

  // ──────────────────────────────────────────────────────────────────
  // REST endpoint: missing required fields returns 400
  // ──────────────────────────────────────────────────────────────────
  test("REST endpoint: POST /approve with missing fields returns 400", async () => {
    // WHEN: Call without required 'account' field
    const res = await request(app)
      .post("/api/withdrawals/approve")
      .send({ amount: 100 });

    // THEN: Returns 400 with error message
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error);
  });
});
