import { test, describe } from "node:test";
import type { CalculateWithdrawCommissionCommand } from "../command.js";
import { handleCalculateWithdrawCommission } from "../commandHandler.js";
import { SliceTester } from "#abstractions/slices/SliceTester.js";
import FundsStreamFactory from "#BusinessCapabilities/Funds/swimlanes/Funds/index.js";

describe("Withdrawal Approval Slice - Unit Tests", () => {
  test("main flow", async () => {
    const givenEvents: Array<{ eventType: string; payload: object }> = []
    const command: CalculateWithdrawCommissionCommand = {
      commandType: "CalculateWithdrawCommission",
      account: "1234",
      amount: 20,
      commission: 0.20,
      currency: "USD",
      session: "0011",
      source: "ATM",
      transactionId: "0011",
      transactionTime: new Date("2025-01-01T11:00:00Z"),
    };
    const expectedEvents = [
      {
        eventType: "WithdrawCommissionCalculated",
        payload: {
          account: '1234',
          amount: 20,
          commission: 0.20,
          currency: 'USD',
          session: '0011',
          source: 'ATM',
          transactionId: '0011',
          transactionTime: new Date("2025-01-01T11:00:00Z"),
        }
      }
    ]
    return SliceTester.testCommandHandler(
      handleCalculateWithdrawCommission,
      FundsStreamFactory,
      givenEvents,
      command,
      expectedEvents
    )
  });
});
