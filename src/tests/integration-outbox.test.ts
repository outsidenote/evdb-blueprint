import { test, describe, before, after } from "node:test";
import * as assert from "node:assert";
import { randomUUID } from "node:crypto";
import { TestDatabase } from "./harness/index.js";
import { createApproveWithdrawalAdapter } from "../BusinessCapabilities/Funds/slices/ApproveWithdrawal/adapter.js";
import type { ApproveWithdrawal } from "../BusinessCapabilities/Funds/slices/ApproveWithdrawal/command.js";
import FundsStreamFactory from "../BusinessCapabilities/Funds/swimlanes/Funds/index.js";
import { QUEUE_NAME } from "../BusinessCapabilities/Funds/endpoints/CalculateWithdrawComission/pg-boss/index.js";
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import EvDbPrismaStorageAdapter from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";

function makeCommand(overrides: Partial<ApproveWithdrawal> = {}): ApproveWithdrawal {
  return {
    commandType: "ApproveWithdrawal",
    account: overrides.account ?? `outbox-test-${randomUUID()}`,
    amount: overrides.amount ?? 100,
    currency: overrides.currency ?? "USD",
    session: overrides.session ?? "test-session",
    source: overrides.source ?? "test-source",
    payer: overrides.payer ?? "test-payer",
    transactionId: overrides.transactionId ?? randomUUID(),
    approvalDate: overrides.approvalDate ?? new Date(),
    transactionTime: overrides.transactionTime ?? new Date(),
  };
}

/**
 * Seeds a FundsDepositApproved event via the stream factory
 * so the stream's SliceStateApproveWithdrawal view has a positive balance.
 */
async function seedDeposit(storageAdapter: IEvDbStorageAdapter, account: string, amount: number) {
  const stream = FundsStreamFactory.create(account, storageAdapter);
  stream.appendEventFundsDepositApproved({
    account,
    amount,
    currency: "USD",
    source: "seed-source",
    payer: "seed-payer",
    transactionId: randomUUID(),
  });
  await stream.store();
}

describe("Outbox verification: external events (CDC channel)", () => {
  const db = new TestDatabase();
  let storageAdapter: IEvDbStorageAdapter;

  before(async () => {
    await db.start();
    const storeClient = EvDbPostgresPrismaClientFactory.create(db.connectionUri);
    storageAdapter = new EvDbPrismaStorageAdapter(storeClient);

    // Create the pg-boss queue so the outbox trigger can insert jobs
    await db.boss.createQueue(QUEUE_NAME);
  });

  after(async () => {
    await db.stop();
  });

  // ──────────────────────────────────────────────────────────────────
  // Declined withdrawal → outbox message with channel='default' (external/CDC)
  // ──────────────────────────────────────────────────────────────────
  test("declined withdrawal creates outbox message with channel='default' for CDC", async () => {
    const account = `declined-${randomUUID()}`;
    const adapter = createApproveWithdrawalAdapter(storageAdapter);

    // GIVEN: No deposit → balance=0
    // WHEN: Withdraw more than balance
    const command = makeCommand({ account, amount: 100 });
    const result = await adapter(command);

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0].eventType, "FundsWithdrawalDeclined");

    // THEN: Outbox contains an external message (channel='default')
    const { rows } = await db.client.query(
      `SELECT id, stream_type, stream_id, event_type, channel, message_type, payload
       FROM public.outbox WHERE stream_id = $1`,
      [account],
    );

    assert.strictEqual(rows.length, 1, "Exactly one outbox message for declined withdrawal");
    assert.strictEqual(rows[0].channel, "default", "Channel should be 'default' for external/CDC events");
    assert.strictEqual(rows[0].stream_type, "WithdrawalApprovalStream");
    assert.strictEqual(rows[0].event_type, "FundsWithdrawalDeclined");
    assert.strictEqual(rows[0].message_type, "WithdrawalDeclinedNotification");

    const payload = typeof rows[0].payload === "string" ? JSON.parse(rows[0].payload) : rows[0].payload;
    assert.strictEqual(payload.account, account);
    assert.strictEqual(payload.amount, 100);
    assert.strictEqual(payload.currency, "USD");
    assert.ok(payload.reason, "Payload should include decline reason");
  });

  // ──────────────────────────────────────────────────────────────────
  // Approved withdrawal → two outbox messages:
  //   1. channel='pg-boss'  → outbox trigger → CalculateWithdrawCommission worker
  //   2. channel='default'  → CDC → Kafka → PendingWithdrawalLookup projection
  // ──────────────────────────────────────────────────────────────────
  test("approved withdrawal creates two outbox messages: pg-boss (internal) + default (CDC)", async () => {
    const account = `approved-${randomUUID()}`;
    const adapter = createApproveWithdrawalAdapter(storageAdapter);

    // GIVEN: Seed a deposit so balance is sufficient
    await seedDeposit(storageAdapter, account, 500);

    // WHEN: Withdraw within balance
    const command = makeCommand({ account, amount: 100 });
    const result = await adapter(command);

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0].eventType, "FundsWithdrawalApproved");

    // THEN: Two outbox rows — one per message producer in withdrawalApprovedMessages
    const { rows } = await db.client.query(
      `SELECT id, channel, event_type, payload
       FROM public.outbox WHERE stream_id = $1 AND channel = 'pg-boss'`,
      [account],
    );

    assert.strictEqual(rows.length, 1, "Exactly one pg-boss outbox message for approved withdrawal");
    assert.strictEqual(rows[0].event_type, "FundsWithdrawalApproved");

    const payload = typeof rows[0].payload === "string" ? JSON.parse(rows[0].payload) : rows[0].payload;
    assert.ok(Array.isArray(payload.queues), "pg-boss messages should have queues array");

    // Also verify: CDC message for approved withdrawal (consumed by PendingWithdrawalLookup projection)
    const { rows: cdcRows } = await db.client.query(
      `SELECT id FROM public.outbox WHERE stream_id = $1 AND channel = 'default'`,
      [account],
    );
    assert.strictEqual(cdcRows.length, 1, "Approved withdrawal should emit one CDC message for projection");

    // Idempotency marker written atomically by message handler
    const { rows: idempotencyRows } = await db.client.query(
      `SELECT id FROM public.outbox WHERE stream_id = $1 AND channel = 'idempotent'`,
      [account],
    );
    assert.strictEqual(idempotencyRows.length, 1, "Idempotency marker exists for approved withdrawal");
  });

  // ──────────────────────────────────────────────────────────────────
  // Outbox row has correct fields for Debezium Outbox Event Router SMT
  // Matches the connector config in infrastructure/cdc/connectors/pg-outbox.json
  // ──────────────────────────────────────────────────────────────────
  test("outbox row has all fields required by Debezium Outbox Event Router", async () => {
    const account = `cdc-fields-${randomUUID()}`;
    const adapter = createApproveWithdrawalAdapter(storageAdapter);

    // Declined → creates external outbox message
    const command = makeCommand({ account, amount: 50 });
    await adapter(command);

    const { rows } = await db.client.query(
      `SELECT id, stream_type, stream_id, "offset", event_type, channel, message_type, payload, captured_at, stored_at
       FROM public.outbox WHERE stream_id = $1 AND channel = 'default'`,
      [account],
    );

    assert.strictEqual(rows.length, 1);
    const row = rows[0];

    // Fields mapped in pg-outbox.json connector config:
    // transforms.outbox.table.field.event.id    → id
    assert.ok(row.id, "id field required for Debezium event deduplication");
    // transforms.outbox.table.field.event.key   → stream_id
    assert.strictEqual(row.stream_id, account, "stream_id used as Kafka message key");
    // transforms.outbox.table.field.event.type  → event_type
    assert.strictEqual(row.event_type, "FundsWithdrawalDeclined", "event_type used for message routing");
    // transforms.outbox.route.by.field          → stream_type
    assert.strictEqual(row.stream_type, "WithdrawalApprovalStream", "stream_type used for topic routing (events.<stream_type>)");
    // transforms.outbox.table.field.event.payload → payload
    assert.ok(row.payload, "payload field required for Debezium message body");

    // Additional fields placed as headers:
    // channel, message_type, offset, captured_at, stored_at
    assert.strictEqual(row.channel, "default");
    assert.ok(row.message_type, "message_type placed as Kafka header");
    assert.ok(row.captured_at, "captured_at placed as Kafka header");
    assert.ok(row.stored_at, "stored_at placed as Kafka header");
  });
});
