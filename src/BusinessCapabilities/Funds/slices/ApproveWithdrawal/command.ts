import type { ICommand } from "../../../../types/abstractions/commands/ICommand.js";

export interface ApproveWithdrawal extends ICommand {
  readonly commandType: "ApproveWithdrawal";
  readonly account: string;
  readonly amount: number;
  readonly approvalDate: Date;
  readonly currency: string;
  readonly session: string;
  readonly source: string;
  readonly payer: string;
  readonly transactionId: string;
  readonly transactionTime: Date;
}
