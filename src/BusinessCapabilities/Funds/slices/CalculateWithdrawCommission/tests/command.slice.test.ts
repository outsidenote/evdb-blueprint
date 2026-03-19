import { test, describe } from "node:test";
import { CalculateWithdrawCommissionCommand } from "../command.js";
import { handleCalculateWithdrawCommission } from "../commandHandler.js";
import type { FundsWithdrawalApproved } from "../../../swimlanes/Funds/events/FundsWithdrawalApproved.js";
import type { FundsWithdrawalDeclined } from "../../../swimlanes/Funds/events/FundsWithdrawalDeclined.js";
import { SliceTester } from "../../../../../types/SliceTester.js";
import FundsStreamFactory from "../../../swimlanes/Funds/index.js";
import type { FundsDepositApproved } from "../../../swimlanes/Funds/events/FundsDepositApproved.js";
import { WithdrawCommissionCalculated } from "../../../swimlanes/Funds/events/WithdrawCommissionCalculated.js";

describe("Withdrawal Approval Slice - Unit Tests", () => {
  test("main flow", async () => {
    const givenEvents: Array<WithdrawCommissionCalculated | FundsWithdrawalApproved | FundsWithdrawalDeclined | FundsDepositApproved> = []
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
      FundsStreamFactory,
      givenEvents,
      command,
      expectedEvents
    )
  });
});
