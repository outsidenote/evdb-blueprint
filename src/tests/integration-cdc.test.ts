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
    const topic = "events.WithdrawalApprovalStream";

    const startOffsets = await stack.snapshotOffset(topic);

    const outboxId = await stack.insertOutboxMessage({
      streamType: "WithdrawalApprovalStream",
      streamId,
      eventType: "FundsWithdrawalDeclined",
      messageType: "Withdrawal Declined Notification",
      payload: {
        payloadType: "Withdrawal Declined Notification",
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
    assert.strictEqual(msg.headers.message_type, "Withdrawal Declined Notification", "Header 'message_type' should match");
  });

  test("messages are routed to topics by stream_type", async () => {
    const streamIdA = `route-a-${randomUUID()}`;
    const streamIdB = `route-b-${randomUUID()}`;
    const topicA = "events.WithdrawalApprovalStream";
    const topicB = "events.AnotherStream";

    const startOffsetsA = await stack.snapshotOffset(topicA);
    const startOffsetsB = await stack.snapshotOffset(topicB);

    await stack.insertOutboxMessage({
      streamType: "WithdrawalApprovalStream",
      streamId: streamIdA,
      eventType: "FundsWithdrawalDeclined",
      messageType: "Notification",
      payload: { payloadType: "TestA", account: streamIdA },
    });

    await stack.insertOutboxMessage({
      streamType: "AnotherStream",
      streamId: streamIdB,
      eventType: "SomeEvent",
      messageType: "Notification",
      offset: 1,
      payload: { payloadType: "TestB", account: streamIdB },
    });

    const [messagesA, messagesB] = await Promise.all([
      stack.waitForMessages(topicA, [streamIdA], startOffsetsA),
      stack.waitForMessages(topicB, [streamIdB], startOffsetsB),
    ]);

    assert.ok(
      messagesA.some((m) => m.key === streamIdA),
      "Message A should be on events.WithdrawalApprovalStream",
    );
    assert.ok(
      messagesB.some((m) => m.key === streamIdB),
      "Message B should be on events.AnotherStream",
    );
  });

  test("Kafka message key equals stream_id for correct partitioning", async () => {
    const streamId = `key-test-${randomUUID()}`;
    const topic = "events.WithdrawalApprovalStream";

    const startOffsets = await stack.snapshotOffset(topic);

    const outboxId = await stack.insertOutboxMessage({
      streamType: "WithdrawalApprovalStream",
      streamId,
      eventType: "FundsWithdrawalDeclined",
      messageType: "Notification",
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
