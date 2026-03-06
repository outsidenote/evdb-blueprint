import { test, describe, before, after } from "node:test";
import * as assert from "node:assert";
import { randomUUID } from "node:crypto";
import { TestCDCStack } from "./harness/TestCDCStack.js";

describe("CDC pipeline: outbox → Debezium → Kafka", { timeout: 180_000 }, () => {
  const stack = new TestCDCStack();

  before(async () => {
    await stack.start();
    await stack.waitForConnectorReady();
  });

  after(async () => {
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
    assert.strictEqual(msg.headers.message_type, "WithdrawalDeclinedNotification", "Header 'message_type' should match");
    assert.strictEqual(msg.headers.stream_type, "WithdrawalApprovalStream", "Header 'stream_type' should match");
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
    assert.strictEqual(msg.key, streamId, "Message key must equal stream_id for partition ordering");

    const payload = typeof msg.value === "string" ? JSON.parse(msg.value) : msg.value;
    assert.strictEqual(payload.outboxId, outboxId, "Payload should contain the original outboxId");
  });
});
