import { test, describe, before, after } from "node:test";
import * as assert from "node:assert";
import { randomUUID } from "node:crypto";
import { Kafka } from "kafkajs";
import { PgBoss } from "pg-boss";
import pg from "pg";
import { TestCDCStack } from "./harness/TestCDCStack.js";
import { waitFor } from "./harness/helpers.js";
import { PgBossEndpointFactory } from "../types/abstractions/endpoints/PgBossEndpointFactory.js";
import { ProjectionFactory } from "../types/abstractions/projections/ProjectionFactory.js";
import { createFundsWithdrawnWorker } from "../BusinessCapabilities/FraudAnalysis/endpoints/RecordFundWithdrawAction/pg-boss/index.js";
import { pendingWithdrawalLookupSlice } from "../BusinessCapabilities/Funds/slices/PendingWithdrawalLookup/index.js";
import { accountBalanceReadModelSlice } from "../BusinessCapabilities/Funds/slices/AccountBalanceReadModel/index.js";
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import EvDbPrismaStorageAdapter from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";

describe("CDC pipeline: outbox → Debezium → Kafka", { timeout: 180_000 }, () => {
  const stack = new TestCDCStack();
  let boss: PgBoss;
  let pool: pg.Pool;
  let pgBossFactory: PgBossEndpointFactory;
  let projectionFactory: ProjectionFactory;

  before(async () => {
    await stack.start();
    await stack.waitForConnectorReady();

    const connectionUri = `postgresql://${stack.client.user}:eventualize123@${stack.client.host}:${stack.client.port}/${stack.client.database}`;

    boss = new PgBoss({ connectionString: connectionUri });
    await boss.start();

    pool = new pg.Pool({ connectionString: connectionUri });

    const storeClient = EvDbPostgresPrismaClientFactory.create(connectionUri);
    const storageAdapter = new EvDbPrismaStorageAdapter(storeClient as any);

    const kafka = new Kafka({
      clientId: "cdc-integration-test-consumer",
      brokers: [stack.kafkaBootstrap],
    });

    pgBossFactory = await PgBossEndpointFactory.startAll(
      boss,
      [createFundsWithdrawnWorker(storageAdapter)],
      pool,
      kafka,
    );

    projectionFactory = await ProjectionFactory.startAll(kafka, pool, [
      pendingWithdrawalLookupSlice,
      accountBalanceReadModelSlice,
    ]);
  });

  after(async () => {
    await projectionFactory?.stop();
    await pgBossFactory?.stop();
    await boss?.stop();
    await pool?.end();
    await stack.stop();
  });

  test("external outbox message appears on Kafka topic via Debezium CDC", async () => {
    const streamId = `cdc-test-${randomUUID()}`;
    const topic = "events.WithdrawalDeclinedNotification";

    const startOffsets = await stack.snapshotOffset(topic);

    const outboxId = await stack.insertOutboxMessage({
      streamType: "WithdrawalApprovalStream",
      streamId,
      eventType: "FundsWithdrawalDeclined",
      messageType: "WithdrawalDeclinedNotification",
      payload: {
        payloadType: "WithdrawalDeclinedNotification",
        account: streamId,
        amount: 100,
        currency: "USD",
        reason: "Insufficient funds",
      },
    });

    const messages = await stack.waitForMessages(topic, [streamId], startOffsets);

    const msg = messages.find((m) => m.key === streamId);
    assert.ok(msg, `Message with key=${streamId} should appear on topic ${topic}`);
    assert.ok(msg.value, "Message should have a value/payload");

    const payload = typeof msg.value === "string" ? JSON.parse(msg.value) : msg.value;
    assert.strictEqual(payload.outboxId, outboxId, "Payload should contain the original outboxId");

    // Verify Debezium header placement from connector config
    assert.strictEqual(msg.headers.channel, "default", "Header 'channel' should be 'default'");
    assert.strictEqual(
      msg.headers.message_type,
      "WithdrawalDeclinedNotification",
      "Header 'message_type' should match",
    );
    assert.strictEqual(
      msg.headers.stream_type,
      "WithdrawalApprovalStream",
      "Header 'stream_type' should match",
    );
  });

  test("messages are routed to topics by message_type", async () => {
    const streamIdA = `route-a-${randomUUID()}`;
    const streamIdB = `route-b-${randomUUID()}`;
    const topicA = "events.WithdrawalDeclinedNotification";
    const topicB = "events.FraudAlertNotification";

    const startOffsetsA = await stack.snapshotOffset(topicA);
    const startOffsetsB = await stack.snapshotOffset(topicB);

    await stack.insertOutboxMessage({
      streamType: "WithdrawalApprovalStream",
      streamId: streamIdA,
      eventType: "FundsWithdrawalDeclined",
      messageType: "WithdrawalDeclinedNotification",
      payload: { payloadType: "TestA", account: streamIdA },
    });

    await stack.insertOutboxMessage({
      streamType: "WithdrawalApprovalStream",
      streamId: streamIdB,
      eventType: "FraudDetected",
      messageType: "FraudAlertNotification",
      offset: 1,
      payload: { payloadType: "TestB", account: streamIdB },
    });

    const [messagesA, messagesB] = await Promise.all([
      stack.waitForMessages(topicA, [streamIdA], startOffsetsA),
      stack.waitForMessages(topicB, [streamIdB], startOffsetsB),
    ]);

    assert.ok(
      messagesA.some((m) => m.key === streamIdA),
      "Message A should be on events.WithdrawalDeclinedNotification",
    );
    assert.ok(
      messagesB.some((m) => m.key === streamIdB),
      "Message B should be on events.FraudAlertNotification",
    );
  });

  test("pg-boss channel messages are excluded from Kafka by publication filter", async () => {
    const topic = "events.WithdrawalDeclinedNotification";
    const pgBossStreamId = `pgboss-${randomUUID()}`;
    const defaultStreamId = `default-${randomUUID()}`;

    const startOffsets = await stack.snapshotOffset(topic);

    // Insert a pg-boss message — should NOT appear on Kafka
    await stack.insertOutboxMessage({
      streamType: "WithdrawalApprovalStream",
      streamId: pgBossStreamId,
      eventType: "FundsWithdrawalDeclined",
      messageType: "WithdrawalDeclinedNotification",
      channel: "pg-boss",
      payload: { payloadType: "PgBossTest", account: pgBossStreamId },
    });

    // Insert a default message — SHOULD appear on Kafka (acts as a sentinel)
    await stack.insertOutboxMessage({
      streamType: "WithdrawalApprovalStream",
      streamId: defaultStreamId,
      eventType: "FundsWithdrawalDeclined",
      messageType: "WithdrawalDeclinedNotification",
      offset: 1,
      payload: { payloadType: "DefaultTest", account: defaultStreamId },
    });

    // Wait for the sentinel (default channel) message to arrive
    const messages = await stack.waitForMessages(topic, [defaultStreamId], startOffsets);

    // The sentinel should be there
    assert.ok(
      messages.some((m) => m.key === defaultStreamId),
      "Default channel message should appear on Kafka",
    );

    // The pg-boss message should NOT be there
    assert.ok(
      !messages.some((m) => m.key === pgBossStreamId),
      "pg-boss channel message should NOT appear on Kafka",
    );
  });

  test("Kafka message key equals stream_id for correct partitioning", async () => {
    const streamId = `key-test-${randomUUID()}`;
    const topic = "events.WithdrawalDeclinedNotification";

    const startOffsets = await stack.snapshotOffset(topic);

    const outboxId = await stack.insertOutboxMessage({
      streamType: "WithdrawalApprovalStream",
      streamId,
      eventType: "FundsWithdrawalDeclined",
      messageType: "WithdrawalDeclinedNotification",
      offset: 2,
      payload: { payloadType: "KeyTest", account: streamId },
    });

    const messages = await stack.waitForMessages(topic, [streamId], startOffsets);

    const msg = messages.find((m) => m.key === streamId);
    assert.ok(msg, "Message should be received");
    assert.strictEqual(
      msg.key,
      streamId,
      "Message key must equal stream_id for partition ordering",
    );

    const payload = typeof msg.value === "string" ? JSON.parse(msg.value) : msg.value;
    assert.strictEqual(payload.outboxId, outboxId, "Payload should contain the original outboxId");
  });

  // ──────────────────────────────────────────────────────────────────
  // Cross-boundary consumer: outbox → Debezium → Kafka
  //   → AutomationEndpointFactory → pg-boss → worker → event
  // ──────────────────────────────────────────────────────────────────
  test("Kafka consumer bridges CDC message to pg-boss worker and produces downstream event", async () => {
    const account = `cdc-consumer-${randomUUID()}`;

    // Insert a FundsWithdrawn outbox row (default channel → CDC → Kafka)
    await stack.insertOutboxMessage({
      streamType: "FundsWithdrawalStream",
      streamId: account,
      eventType: "FundsWithdrawn",
      messageType: "FundsWithdrawn",
      payload: {
        payloadType: "FundsWithdrawn",
        account,
        amount: 200,
        commission: 2,
        currency: "GBP",
        transactionId: "txn-cdc-001",
      },
    });

    // Wait for the full pipeline to complete
    await waitFor(async () => {
      const { rows } = await stack.client.query(
        "SELECT payload FROM public.events WHERE stream_id = $1 AND event_type = 'FundsWithdrawActionRecorded'",
        [account],
      );
      return rows.length > 0;
    }, 60_000);

    const { rows } = await stack.client.query(
      "SELECT payload FROM public.events WHERE stream_id = $1 AND event_type = 'FundsWithdrawActionRecorded'",
      [account],
    );
    const recorded = rows[0].payload;

    assert.strictEqual(
      recorded.amount,
      202,
      "Recorded amount should be amount + commission (200 + 2)",
    );
    assert.strictEqual(recorded.account, account);
    assert.strictEqual(recorded.currency, "GBP");
  });

  // ──────────────────────────────────────────────────────────────────
  // Projection: outbox → Debezium → Kafka → ProjectionFactory
  //   → projections table (full pipeline for PendingWithdrawalLookup)
  //
  // Event order: FundsWithdrawalApproved → UPSERT, FundsWithdrawn → DELETE
  // ──────────────────────────────────────────────────────────────────
  test("FundsWithdrawalApproved CDC message creates a PendingWithdrawalLookup projection row", async () => {
    const account = `proj-cdc-${randomUUID()}`;

    await stack.insertOutboxMessage({
      streamType: "FundsWithdrawalStream",
      streamId: account,
      eventType: "FundsWithdrawalApproved",
      messageType: "FundsWithdrawalApproved",
      payload: {
        payloadType: "FundsWithdrawalApproved",
        account,
        amount: 300,
        currency: "USD",
        transactionId: "txn-proj-001",
      },
    });

    // Wait for projection row to appear
    await waitFor(async () => {
      const { rows } = await pool.query(
        `SELECT payload FROM projections WHERE name = 'PendingWithdrawalLookup' AND key = $1`,
        [account],
      );
      return rows.length > 0;
    }, 60_000);

    const { rows } = await pool.query(
      `SELECT payload FROM projections WHERE name = 'PendingWithdrawalLookup' AND key = $1`,
      [account],
    );

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].payload.account, account);
    assert.strictEqual(rows[0].payload.amount, 300);
    assert.strictEqual(rows[0].payload.currency, "USD");
    assert.strictEqual(rows[0].payload.transactionId, "txn-proj-001");
  });

  test("FundsWithdrawn CDC message removes the PendingWithdrawalLookup projection row", async () => {
    const account = `proj-cdc-del-${randomUUID()}`;

    // Insert an approval → projection row created
    await stack.insertOutboxMessage({
      streamType: "FundsWithdrawalStream",
      streamId: account,
      eventType: "FundsWithdrawalApproved",
      messageType: "FundsWithdrawalApproved",
      payload: {
        payloadType: "FundsWithdrawalApproved",
        account,
        amount: 100,
        currency: "USD",
        transactionId: "txn-s1",
      },
    });

    await waitFor(async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM projections WHERE name = 'PendingWithdrawalLookup' AND key = $1`,
        [account],
      );
      return rows.length > 0;
    }, 60_000);

    // Insert a withdrawal → projection row removed
    await stack.insertOutboxMessage({
      streamType: "FundsWithdrawalStream",
      streamId: account,
      eventType: "FundsWithdrawn",
      messageType: "FundsWithdrawn",
      offset: 1,
      payload: {
        payloadType: "FundsWithdrawn",
        account,
        amount: 100,
        commission: 1,
        currency: "USD",
        transactionId: "txn-s1",
      },
    });

    await waitFor(async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM projections WHERE name = 'PendingWithdrawalLookup' AND key = $1`,
        [account],
      );
      return rows.length === 0;
    }, 60_000);

    const { rows } = await pool.query(
      `SELECT 1 FROM projections WHERE name = 'PendingWithdrawalLookup' AND key = $1`,
      [account],
    );
    assert.strictEqual(rows.length, 0, "Projection row must be deleted after FundsWithdrawn");
  });
});
