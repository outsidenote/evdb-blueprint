import * as assert from "node:assert";

import StorageAdapterStub from "./StorageAdapterStub.js";
import type { WithdrawalApprovalStreamType } from "../eventstore/WithdrawalApprovalsStream/index.js";
import WithdrawalApprovalStreamFactory from "../eventstore/WithdrawalApprovalsStream/index.js";
import { ApproveWithdrawal } from "../slices/ApproveWithdrawal/command.js";
import { handleApproveWithdrawal } from "../slices/ApproveWithdrawal/commandHandler.js";
import type { FundsWithdrawalApproved } from "../eventstore/WithdrawalApprovalsStream/events/FundsWithdrawalApproved.js";
import type { FundsWithdrawalDeclined } from "../eventstore/WithdrawalApprovalsStream/events/FundsWithdrawalDeclined.js";
import { EvDbEventStoreBuilder } from "@eventualize/core/store/EvDbEventStoreBuilder";

export enum EVENT_STORE_TYPE {
  STUB = "Stub",
}

export default class Steps {
  public static createEventStore() {
    const storageAdapter = new StorageAdapterStub();

    const eventstore = new EvDbEventStoreBuilder()
      .withAdapter(storageAdapter)
      .withStreamFactory(WithdrawalApprovalStreamFactory)
      .build();

    return eventstore;
  }

  public static createWithdrawalStream(
    streamId: string,
    eventStore: ReturnType<typeof Steps.createEventStore>,
  ): WithdrawalApprovalStreamType {
    return eventStore.createWithdrawalApprovalStream(streamId) as WithdrawalApprovalStreamType;
  }

  // ──────────────────────────────────────────────
  // Commands
  // ──────────────────────────────────────────────

  public static approveWithdrawalWithSufficientFunds(stream: WithdrawalApprovalStreamType): void {
    const command = new ApproveWithdrawal({
      account: "1234",
      amount: 20,
      approvalDate: new Date("2025-01-01T11:00:00Z"),
      currency: "USD",
      session: "0011",
      source: "ATM",
      payer: "John Doe",
      transactionId: "0011",
      transactionTime: new Date("2025-01-01T11:00:00Z"),
      currentBalance: 200,
    });
    handleApproveWithdrawal(command);
  }

  public static approveWithdrawalWithInsufficientFunds(stream: WithdrawalApprovalStreamType): void {
    const command = new ApproveWithdrawal({
      account: "1234",
      amount: 20,
      approvalDate: new Date("2025-01-01T11:00:00Z"),
      currency: "USD",
      session: "0011",
      source: "ATM",
      payer: "John Doe",
      transactionId: "0011",
      transactionTime: new Date("2025-01-01T11:00:00Z"),
      currentBalance: 10,
    });
    handleApproveWithdrawal(command);
  }

  // ──────────────────────────────────────────────
  // Assertions
  // ──────────────────────────────────────────────

  public static assertWithdrawalApproved(stream: WithdrawalApprovalStreamType): void {
    const events = stream.getEvents();
    assert.strictEqual(events.length, 1, "Expected exactly 1 event");

    const payload = events[0].payload as FundsWithdrawalApproved;
    assert.strictEqual(payload.payloadType, "FundsWithdrawalApproved");
    assert.strictEqual(payload.amount, 20);
    assert.strictEqual(payload.account, "1234");
    assert.strictEqual(payload.currency, "USD");
    assert.strictEqual(payload.payer, "John Doe");
    assert.strictEqual(payload.source, "ATM");
    assert.strictEqual(payload.transactionId, "0011");
  }

  public static assertWithdrawalDeclined(stream: WithdrawalApprovalStreamType): void {
    const events = stream.getEvents();
    assert.strictEqual(events.length, 1, "Expected exactly 1 event");

    const payload = events[0].payload as FundsWithdrawalDeclined;
    assert.strictEqual(payload.payloadType, "FundsWithdrawalDeclined");
    assert.strictEqual(payload.amount, 20);
    assert.strictEqual(payload.account, "1234");
    assert.strictEqual(payload.currency, "USD");
    assert.strictEqual(payload.payer, "John Doe");
    assert.strictEqual(payload.source, "ATM");
    assert.ok(
      payload.reason.includes("Insufficient funds"),
      "Expected decline reason to mention insufficient funds",
    );
  }

  public static assertMessagesProduced(stream: WithdrawalApprovalStreamType, expectedCount: number): void {
    const messages = stream.getMessages();
    assert.strictEqual(messages.length, expectedCount, `Expected ${expectedCount} messages`);
  }

  public static compareFetchedAndStoredStreams(
    storedStream: WithdrawalApprovalStreamType,
    fetchedStream: WithdrawalApprovalStreamType,
  ): void {
    assert.strictEqual(fetchedStream.getEvents().length, 0);
    assert.strictEqual(fetchedStream.storedOffset, storedStream.storedOffset);
  }
}
