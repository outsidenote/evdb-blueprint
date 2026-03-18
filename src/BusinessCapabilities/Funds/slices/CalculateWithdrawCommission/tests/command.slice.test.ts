import { test, describe } from "node:test";
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import { CalculateWithdrawCommissionCommand } from "../command.js";
import { handleCalculateWithdrawCommission } from "../commandHandler.js";
import { WithdrawCommissionCalculated } from "../../../swimlanes/Funds/events/WithdrawCommissionCalculated/event.js";
import { SliceTester } from "../../../../../types/SliceTester.js";

const TestStreamFactory = new StreamFactoryBuilder("WithdrawalApprovalStream")
  .withEventType(WithdrawCommissionCalculated)
  .build();

describe("Withdrawal Approval Slice - Unit Tests", () => {
  test("main flow", async () => {
    const givenEvents: WithdrawCommissionCalculated[] = [];
    const command = new CalculateWithdrawCommissionCommand({
      account: "1234",
      amount: 20,
      commission: 0.20,
      currency: "USD",
      session: "0011",
      source: "ATM",
      transactionId: "0011",
      transactionTime: new Date("2025-01-01T11:00:00Z"),
    });
    const expectedEvents = [
      new WithdrawCommissionCalculated({
        account: '1234',
        amount: 20,
        commission: 0.20,
        currency: 'USD',
        session: '0011',
        source: 'ATM',
        transactionId: '0011',
        transactionTime: new Date("2025-01-01T11:00:00Z"),
      })
    ]
    return SliceTester.testCommandHandler(
      handleCalculateWithdrawCommission,
      TestStreamFactory,
      givenEvents,
      command,
      expectedEvents
    )
  });
});
