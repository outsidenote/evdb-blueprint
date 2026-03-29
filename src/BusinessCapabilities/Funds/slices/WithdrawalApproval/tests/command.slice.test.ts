import { test, describe } from "node:test";
import type { ApproveWithdrawal } from "../command.js";
import { handleApproveWithdrawal } from "../commandHandler.js";
import { SliceTester } from "#abstractions/slices/SliceTester.js";
import FundsStreamFactory from "#BusinessCapabilities/Funds/swimlanes/Funds/index.js";

describe("Withdrawal Approval Slice - Unit Tests", () => {
  test("main flow", async () => {
    const givenEvents = [
      {
        eventType: "FundsDepositApproved",
        payload: {
          account: '1234',
          amount: 20,
          currency: 'USD',
          payer: 'John Doe',
          source: 'ATM',
          transactionId: '0011'
        }
      }
    ]
    const command: ApproveWithdrawal = {
      commandType: "ApproveWithdrawal",
      account: "1234",
      amount: 20,
      approvalDate: new Date("2025-01-01T11:00:00Z"),
      currency: "USD",
      session: "0011",
      source: "ATM",
      payer: "John Doe",
      transactionId: "0011",
      transactionTime: new Date("2025-01-01T11:00:00Z"),
    };
    const expectedEvents = [
      {
        eventType: "FundsWithdrawalApproved",
        payload: {
          account: '1234',
          amount: 20,
          currency: 'USD',
          session: '0011',
          source: 'ATM',
          payer: 'John Doe',
          transactionId: '0011'
        }
      }
    ]
    return SliceTester.testCommandHandler(
      handleApproveWithdrawal,
      FundsStreamFactory,
      givenEvents,
      command,
      expectedEvents
    )
  });
  test("Can't withdraw when funds insufficient", async () => {
    const givenEvents = [
      {
        eventType: "FundsDepositApproved",
        payload: {
          account: '1234',
          amount: 20,
          currency: 'USD',
          payer: 'John Doe',
          source: 'ATM',
          transactionId: '0011'
        }
      }
    ]

    const command: ApproveWithdrawal = {
      commandType: "ApproveWithdrawal",
      account: "123",
      amount: 100,
      approvalDate: new Date("2025-01-01T11:00:00Z"),
      currency: "USD",
      session: "0011",
      source: "ATM",
      payer: "John Doe",
      transactionId: "0011",
      transactionTime: new Date("2025-01-01T11:00:00Z"),
    };
    const expectedEvents = [
      {
        eventType: "FundsWithdrawalDeclined",
        payload: {
          account: '123',
          session: '0011',
          currency: 'USD',
          amount: 100,
          reason: 'Insufficient funds: balance 20 is less than withdrawal amount 100',
          payer: 'John Doe',
          source: 'ATM',
          transactionId: '0011'
        }
      }
    ]
    return SliceTester.testCommandHandler(
      handleApproveWithdrawal,
      FundsStreamFactory,
      givenEvents,
      command,
      expectedEvents
    )
  });
});
