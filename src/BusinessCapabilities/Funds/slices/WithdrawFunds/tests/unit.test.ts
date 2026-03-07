import { test, describe } from "node:test";
import { WithdrawFunds } from "../command.js";
import { handleWithdrawFunds } from "../commandHandler.js";
import { FundsWithdrawn } from "../../../swimlanes/Funds/events/FundsWithdrawn.js";
import { FundsWithdrawDeclined } from "../../../swimlanes/Funds/events/FundsWithdrawDeclined.js";
import { SliceTester } from "../../../../../types/SliceTester.js";
import FundsStreamFactory from "../../../swimlanes/Funds/index.js";
import { FundsDepositApproved } from "../../../swimlanes/Funds/events/FundsDepositApproved.js";

describe("Withdraw Funds Slice - Unit Tests", () => {
  test("main flow - sufficient balance", async () => {
    const givenEvents = [
      new FundsDepositApproved({
        account: '1234',
        amount: 100,
        currency: 'USD',
        payer: 'John Doe',
        session: '0011',
        source: 'ATM',
        transactionId: '0011'
      })
    ];
    const command = new WithdrawFunds({
      account: "1234",
      amount: 21,
      commission: 0.21,
      currency: "USD",
      session: "0011",
    });
    const expectedEvents = [
      new FundsWithdrawn({
        account: '1234',
        amount: 21,
        commission: 0.21,
        currency: 'USD',
        session: '0011',
      })
    ];
    return SliceTester.testCommandHandler(
      handleWithdrawFunds,
      FundsStreamFactory,
      givenEvents,
      command,
      expectedEvents
    );
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
    ];
    const command = new WithdrawFunds({
      account: "1234",
      amount: 100,
      commission: 1.00,
      currency: "USD",
      session: "0011",
    });
    const expectedEvents = [
      new FundsWithdrawDeclined({
        account: '1234',
        amount: 100,
        currency: 'USD',
        session: '0011',
        reason: 'Insufficient funds: balance 20 is less than withdrawal amount 100'
      })
    ];
    return SliceTester.testCommandHandler(
      handleWithdrawFunds,
      FundsStreamFactory,
      givenEvents,
      command,
      expectedEvents
    );
  });
});
