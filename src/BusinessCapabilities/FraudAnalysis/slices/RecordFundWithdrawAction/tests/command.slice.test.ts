import { test, describe } from "node:test";
import type { RecordFundWithdrawAction } from "../command.js";
import { handleRecordFundWithdrawAction } from "../commandHandler.js";
import { FundsWithdrawActionRecorded } from "../../../swimlanes/FraudAnalysis/events/FundsWithdrawActionRecorded.js";
import { SliceTester } from "../../../../../types/abstractions/slices/SliceTester.js";
import FraudAnalysisStreamFactory from "../../../swimlanes/FraudAnalysis/index.js";

describe("Record Fund Withdraw Action Slice - Unit Tests", () => {
  test("main flow - records fund withdraw action", async () => {
    const givenEvents: [] = [];
    const command: RecordFundWithdrawAction = {
      commandType: "RecordFundWithdrawAction",
      account: "acc-001",
      amount: 100,
      currency: "USD",
      transactionId: "session-001",
    };
    const expectedEvents = [
      new FundsWithdrawActionRecorded({
        account: "acc-001",
        amount: 100,
        currency: "USD",
        transactionId: "session-001",
      }),
    ];
    return SliceTester.testCommandHandler(
      handleRecordFundWithdrawAction,
      FraudAnalysisStreamFactory,
      givenEvents,
      command,
      expectedEvents,
    );
  });
});
