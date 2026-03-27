import { test, describe } from "node:test";
import type { WithdrawFunds } from "../command.js";
import { handleWithdrawFunds } from "../commandHandler.js";
import { SliceTester } from "../../../../../types/abstractions/slices/SliceTester.js";
import FundsStreamFactory from "../../../swimlanes/Funds/index.js";

describe("Withdraw Funds Slice - Unit Tests", () => {
  test("main flow - sufficient balance", async () => {
    const givenEvents = [
      {
        eventType: "FundsDepositApproved",
        payload: {
          account: '1234',
          amount: 100,
          currency: 'USD',
          payer: 'John Doe',
          source: 'ATM',
          transactionId: '0011'
        }
      }
    ];
    const command: WithdrawFunds = {
      commandType: "WithdrawFunds",
      account: "1234",
      amount: 21,
      commission: 0.21,
      currency: "USD",
      transactionId: "0011",
    };
    const expectedEvents = [
      {
        eventType: "FundsWithdrawn",
        payload: {
          account: '1234',
          amount: 21,
          commission: 0.21,
          currency: 'USD',
          transactionId: '0011',
        }
      }
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
    ];
    const command: WithdrawFunds = {
      commandType: "WithdrawFunds",
      account: "1234",
      amount: 100,
      commission: 1.00,
      currency: "USD",
      transactionId: "0011",
    };
    const expectedEvents = [
      {
        eventType: "FundsWithdrawDeclined",
        payload: {
          account: '1234',
          amount: 100,
          currency: 'USD',
          transactionId: '0011',
          reason: 'Insufficient funds: balance 20 is less than withdrawal amount 100'
        }
      }
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
