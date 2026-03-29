import type { ICommand } from "#abstractions/commands/ICommand.js";

export interface CalculateWithdrawCommissionCommand extends ICommand {
  readonly commandType: "CalculateWithdrawCommission";
  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
  readonly session: string;
  readonly source: string;
  readonly transactionId: string;
  readonly transactionTime: Date;
}
