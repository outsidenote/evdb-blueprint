import { test, describe } from "node:test";
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import { ApproveWithdrawal } from "../command.js";
import { handleApproveWithdrawal } from "../commandHandler.js";
import { FundsWithdrawalApproved } from "../../../swimlanes/Funds/events/FundsWithdrawalApproved/event.js";
import { FundsWithdrawalDeclined } from "../../../swimlanes/Funds/events/FundsWithdrawalDeclined/event.js";
import { FundsDepositApproved } from "../../../swimlanes/Funds/events/FundsDepositApproved/event.js";
import { SliceTester } from "../../../../../types/SliceTester.js";
import { handlers as sliceStateHandlers } from "../../../swimlanes/Funds/views/SliceStateApproveWithdrawal/handlers.js";
import { defaultState as sliceStateDefaultState, viewName as sliceStateViewName } from "../../../swimlanes/Funds/views/SliceStateApproveWithdrawal/state.js";

const TestStreamFactory = new StreamFactoryBuilder("WithdrawalApprovalStream")
  .withEventType(FundsDepositApproved)
  .withEventType(FundsWithdrawalApproved)
  .withEventType(FundsWithdrawalDeclined)
  .withView(sliceStateViewName, sliceStateDefaultState, sliceStateHandlers)
  .build();

describe("Withdrawal Approval Slice - Unit Tests", () => {
  test("main flow", async () => {
    const givenEvents = [
      new FundsDepositApproved({
        account: '1234',
        amount: 20,
        currency: 'USD',
        payer: 'John Doe',
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
      TestStreamFactory,
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
      TestStreamFactory,
      givenEvents,
      command,
      expectedEvents
    )
  });
});
