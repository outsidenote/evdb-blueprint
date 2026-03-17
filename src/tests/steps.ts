import * as assert from "node:assert";

import StorageAdapterStub from "./StorageAdapterStub.js";
import type { FundsStreamType } from "../BusinessCapabilities/Funds/swimlanes/Funds/index.js";
import { ApproveWithdrawal } from "../BusinessCapabilities/Funds/slices/ApproveWithdrawal/command.js";
import { handleApproveWithdrawal } from "../BusinessCapabilities/Funds/slices/ApproveWithdrawal/commandHandler.js";
import type { FundsWithdrawalApproved } from "../BusinessCapabilities/Funds/swimlanes/Funds/events/FundsWithdrawalApproved/event.js";
import type { FundsWithdrawalDeclined } from "../BusinessCapabilities/Funds/swimlanes/Funds/events/FundsWithdrawalDeclined/event.js";
import { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";

export default class Steps {
  public static createStorageAdapter() {
    return new StorageAdapterStub();
  }

  public static async createWithdrawalStream(
    streamId: string,
    storageAdapter: IEvDbStorageAdapter,
  ) {
    const { FundsStreamFactory } = await import("../BusinessCapabilities/Funds/swimlanes/Funds/index.js");
    return FundsStreamFactory.create(streamId, storageAdapter, storageAdapter);
  }

  // ──────────────────────────────────────────────
  // Commands — call the pure handler directly with the stream
  // ──────────────────────────────────────────────

  public static approveWithdrawalWithSufficientFunds(stream: FundsStreamType): void {
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
    });
    handleApproveWithdrawal(stream, command);
  }

  public static approveWithdrawalWithInsufficientFunds(stream: FundsStreamType): void {
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
    });
    handleApproveWithdrawal(stream, command);
  }

  // ──────────────────────────────────────────────
  // Assertions
  // ──────────────────────────────────────────────

  public static assertWithdrawalApproved(stream: FundsStreamType): void {
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

  public static assertWithdrawalDeclined(stream: FundsStreamType): void {
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

  public static assertMessagesProduced(stream: FundsStreamType, expectedCount: number): void {
    const messages = stream.getMessages();
    assert.strictEqual(messages.length, expectedCount, `Expected ${expectedCount} messages`);
  }

  public static compareFetchedAndStoredStreams(
    storedStream: FundsStreamType,
    fetchedStream: FundsStreamType,
  ): void {
    assert.strictEqual(fetchedStream.getEvents().length, 0);
    assert.strictEqual(fetchedStream.storedOffset, storedStream.storedOffset);
  }
}
