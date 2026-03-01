import * as assert from "node:assert";
import { test, describe, before, beforeEach } from "node:test";
import Steps from "../../../../../tests/steps.js";
import { ApproveWithdrawal } from "../command.js";
import { handleApproveWithdrawal } from "../commandHandler.js";
import type { WithdrawalApprovalStreamType } from "../../../swimlanes/WithdrawalApprovalsStream/index.js";
import { FundsWithdrawalApproved } from "../../../swimlanes/WithdrawalApprovalsStream/events/FundsWithdrawalApproved.js";
import { FundsWithdrawalDeclined } from "../../../swimlanes/WithdrawalApprovalsStream/events/FundsWithdrawalDeclined.js";
import { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import { SliceTester } from "../../../../../types/SliceTester.js";
import WithdrawalApprovalStreamFactory from "../../../swimlanes/WithdrawalApprovalsStream/index.js";

// interface TestContext {
//   storageAdapter: IEvDbStorageAdapter;
//   stream: WithdrawalApprovalStreamType;
// }

describe("Withdrawal Approval Slice - Unit Tests", () => {
  test("main flow", async () => {
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
    const expectedEvents = [
      new FundsWithdrawalApproved({
        account: '1234',
        amount: 20,
        currency: 'USD',
        payer: 'John Doe',
        session: '0011',
        source: 'ATM',
        transactionId: '0011'
      })
    ]
    return SliceTester.testCommandHandler(
      handleApproveWithdrawal,
      WithdrawalApprovalStreamFactory,
      [],
      command,
      expectedEvents
    )
  });
  test("Can't withdraw when funds insufficient", async () => {
    const command = new ApproveWithdrawal({
      account: "123",
      amount: 100,
      approvalDate: new Date("2025-01-01T11:00:00Z"),
      currency: "USD",
      session: "0011",
      source: "ATM",
      payer: "John Doe",
      transactionId: "0011",
      transactionTime: new Date("2025-01-01T11:00:00Z"),
      currentBalance: 50,
    });
    const expectedEvents = [
      new FundsWithdrawalDeclined({
        account: '123',
        amount: 100,
        currency: 'USD',
        payer: 'John Doe',
        session: '0011',
        source: 'ATM',
        transactionId: '0011',
        reason: 'Insufficient funds: balance 50 is less than withdrawal amount 100'
      })
    ]
    return SliceTester.testCommandHandler(
      handleApproveWithdrawal,
      WithdrawalApprovalStreamFactory,
      [],
      command,
      expectedEvents
    )
  });
  // // ──────────────────────────────────────────────────────────────────
  // // Scenario 1: Withdrawal Approved (sufficient funds)
  // // ──────────────────────────────────────────────────────────────────
  // test("main functionality", async (t) => {
  //   const ctx: Partial<TestContext> = {};

  //   await t.test("Given: an empty withdrawal approval stream", async () => {
  //     ctx.storageAdapter = Steps.createStorageAdapter();
  //     ctx.stream = await Steps.createWithdrawalStream("account-1234", ctx.storageAdapter);
  //   });

  //   await t.test("When: ApproveWithdrawal command is issued with currentBalance=200, amount=20", () => {
  //     Steps.approveWithdrawalWithSufficientFunds(ctx.stream!);
  //   });

  //   await t.test("Then: a FundsWithdrawalApproved event is emitted", () => {
  //     Steps.assertWithdrawalApproved(ctx.stream!);
  //   });

  //   await t.test("And: a withdrawal approved notification message is produced", () => {
  //     Steps.assertMessagesProduced(ctx.stream!, 1);
  //   });
  // });

  // // ──────────────────────────────────────────────────────────────────
  // // Scenario 2: Withdrawal Declined (insufficient funds)
  // // ──────────────────────────────────────────────────────────────────
  // test("Decline withdrawal when balance is insufficient", async (t) => {
  //   const ctx: Partial<TestContext> = {};
  //   beforeEach(() => {
  //     ctx.storageAdapter = Steps.createStorageAdapter();
  //     ctx.stream = await Steps.createWithdrawalStream("account-1234", ctx.storageAdapter);
  //   }

  //   await t.test("Given: an empty withdrawal approval stream", async () => {
  //     ctx.storageAdapter = Steps.createStorageAdapter();
  //     ctx.stream = await Steps.createWithdrawalStream("account-1234", ctx.storageAdapter);
  //   });

  //   await t.test("When: ApproveWithdrawal command is issued with currentBalance=10, amount=20", () => {
  //     Steps.approveWithdrawalWithInsufficientFunds(ctx.stream!);
  //   });

  //   await t.test("Then: a FundsWithdrawalDeclined event is emitted with reason", () => {
  //     Steps.assertWithdrawalDeclined(ctx.stream!);
  //   });

  //   await t.test("And: a withdrawal declined notification message is produced", () => {
  //     Steps.assertMessagesProduced(ctx.stream!, 1);
  //   });
  // });

  // // ──────────────────────────────────────────────────────────────────
  // // Scenario 3: Exact balance withdrawal (edge case)
  // // ──────────────────────────────────────────────────────────────────
  // test("Approve withdrawal when balance equals withdrawal amount exactly", async (t) => {
  //   const ctx: Partial<TestContext> = {};

  //   await t.test("Given: an empty withdrawal approval stream", async () => {
  //     ctx.storageAdapter = Steps.createStorageAdapter();
  //     ctx.stream = await Steps.createWithdrawalStream("account-5678", ctx.storageAdapter);
  //     ctx.stream.getEvents(); // Ensure stream is initialized
  //   });

  //   await t.test("When: ApproveWithdrawal command is issued with currentBalance=20, amount=20", () => {
  //     const command = new ApproveWithdrawal({
  //       account: "5678",
  //       amount: 20,
  //       approvalDate: new Date("2025-01-01T11:00:00Z"),
  //       currency: "USD",
  //       session: "0022",
  //       source: "ATM",
  //       payer: "Jane Doe",
  //       transactionId: "0022",
  //       transactionTime: new Date("2025-01-01T11:00:00Z"),
  //       currentBalance: 20,
  //     });
  //     handleApproveWithdrawal(ctx.stream!, command);
  //   });

  //   await t.test("Then: a FundsWithdrawalApproved event is emitted (balance == amount is sufficient)", () => {
  //     const events = ctx.stream!.getEvents();
  //     assert.strictEqual(events.length, 1);

  //     const payload = events[0].payload as FundsWithdrawalApproved;
  //     assert.strictEqual(payload.payloadType, "FundsWithdrawalApproved");
  //     assert.strictEqual(payload.amount, 20);
  //     assert.strictEqual(payload.account, "5678");
  //   });
  // });

  // // ──────────────────────────────────────────────────────────────────
  // // Scenario 4: Insufficient Effective Funds Withdrawals (from spec)
  // //   WHEN: ApproveWithdrawal { Account:123, Amount:100, CurrentBalance:50 }
  // //   THEN: FundsWithdrawalDeclined
  // // ──────────────────────────────────────────────────────────────────
  // test("Insufficient Effective Funds Withdrawals", async (t) => {
  //   const ctx: Partial<TestContext> = {};

  //   await t.test("Given: an empty withdrawal approval stream for account 123", async () => {
  //     ctx.storageAdapter = Steps.createStorageAdapter();
  //     ctx.stream = await Steps.createWithdrawalStream("account-123", ctx.storageAdapter);
  //   });

  //   await t.test("When: ApproveWithdrawal command is issued with Account=123, Amount=100, CurrentBalance=50", () => {
  //     const command = new ApproveWithdrawal({
  //       account: "123",
  //       amount: 100,
  //       approvalDate: new Date("2025-01-01T11:00:00Z"),
  //       currency: "USD",
  //       session: "0011",
  //       source: "ATM",
  //       payer: "John Doe",
  //       transactionId: "0011",
  //       transactionTime: new Date("2025-01-01T11:00:00Z"),
  //       currentBalance: 50,
  //     });
  //     handleApproveWithdrawal(ctx.stream!, command);
  //   });

  //   await t.test("Then: a FundsWithdrawalDeclined event is emitted", () => {
  //     const events = ctx.stream!.getEvents();
  //     assert.strictEqual(events.length, 1);

  //     const payload = events[0].payload as FundsWithdrawalDeclined;
  //     assert.strictEqual(payload.payloadType, "FundsWithdrawalDeclined");
  //     assert.strictEqual(payload.account, "123");
  //     assert.strictEqual(payload.amount, 100);
  //     assert.ok(
  //       payload.reason.includes("Insufficient funds"),
  //       "Expected decline reason to mention insufficient funds",
  //     );
  //   });

  //   await t.test("And: a withdrawal declined notification message is produced", () => {
  //     Steps.assertMessagesProduced(ctx.stream!, 1);
  //   });
  // });
});
