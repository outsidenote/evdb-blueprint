import type { ICommand } from "#abstractions/commands/ICommand.js";

export interface WithdrawFunds extends ICommand {
  readonly commandType: "WithdrawFunds";
  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
  readonly transactionId: string;
}
