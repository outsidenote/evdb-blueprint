import { test, describe } from "node:test";
import { ApproveWithdrawal } from "../command.js";
import { handleApproveWithdrawal } from "../commandHandler.js";
import { FundsWithdrawalApproved } from "../../../swimlanes/Funds/events/FundsWithdrawalApproved.js";
import { FundsWithdrawalDeclined } from "../../../swimlanes/Funds/events/FundsWithdrawalDeclined.js";
import { SliceTester } from "../../../../../types/SliceTester.js";
import FundsStreamFactory from "../../../swimlanes/Funds/index.js";
import { FundsDepositApproved } from "../../../swimlanes/Funds/events/FundsDepositApproved.js";

describe("Withdrawal Approval Slice - Unit Tests", () => {
  test("main flow", async () => {
    const givenEvents = [
      new FundsDepositApproved({
        account: '1234',
        amount: 20,
        currency: 'USD',
        payer: 'John Doe',
        session: '0011',
        source: 'ATM',
        transactionId: '0011'
      })
    ]
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
      FundsStreamFactory,
      givenEvents,
      command,
      expectedEvents
    )
  });
  test("Can't withdraw when funds insufficient", async () => {
    const givenEvents = [
      new FundsDepositApproved({
        account: '1234',
        amount: 20,
        currency: 'USD',
        payer: 'John Doe',
        session: '0011',
        source: 'ATM',
        transactionId: '0011'
      })
    ]

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
        reason: 'Insufficient funds: balance 20 is less than withdrawal amount 100'
      })
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
