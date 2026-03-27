import type { ICommand } from "#abstractions/commands/ICommand.js";

export interface RecordFundWithdrawAction extends ICommand {
  readonly commandType: "RecordFundWithdrawAction";
  readonly account: string;
  readonly amount: number;
  readonly currency: string;
  readonly transactionId: string;
}
