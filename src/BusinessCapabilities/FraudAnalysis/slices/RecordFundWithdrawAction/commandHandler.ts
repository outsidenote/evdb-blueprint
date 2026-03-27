import type { CommandHandler } from "../../../../types/abstractions/commands/commandHandler.js";
import type { RecordFundWithdrawAction } from "./command.js";
import type { FraudAnalysisStreamType } from "../../swimlanes/FraudAnalysis/index.js";

/**
 * Pure command handler for the RecordFundWithdrawAction command.
 *
 * Records a funds withdrawal action for fraud analysis purposes.
 * Always appends FundsWithdrawActionRecorded — no decision logic required.
 */
export const handleRecordFundWithdrawAction: CommandHandler<
  FraudAnalysisStreamType,
  RecordFundWithdrawAction
> = (stream, command) => {
  stream.appendEventFundsWithdrawActionRecorded({
    account: command.account,
    amount: command.amount,
    currency: command.currency,
    transactionId: command.transactionId,
  });
};
