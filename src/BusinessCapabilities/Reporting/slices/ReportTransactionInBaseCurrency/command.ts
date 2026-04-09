import type { ICommand } from "#abstractions/commands/ICommand.js";

export interface ReportTransactionInBaseCurrency extends ICommand {
  readonly commandType: "ReportTransactionInBaseCurrency";
  readonly account: string;
  readonly amount: number;
  readonly baseCurrencyAmount: number;
  readonly currency: string;
  readonly exchangeRate: number;
  readonly reportDate: Date;
  readonly session: string;
}
