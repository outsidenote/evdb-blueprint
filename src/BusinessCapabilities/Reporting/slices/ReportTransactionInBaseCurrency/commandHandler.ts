import type { CommandHandler } from "#abstractions/commands/commandHandler.js";
import type { ReportTransactionInBaseCurrency } from "./command.js";
import type { ReportingStreamType } from "#BusinessCapabilities/Reporting/swimlanes/Reporting/index.js";

/**
 * Pure command handler for the ReportTransactionInBaseCurrency command.
 * ONLY appends events — no I/O, no fetching, no returning values.
 */
export const handleReportTransactionInBaseCurrency: CommandHandler<
  ReportingStreamType,
  ReportTransactionInBaseCurrency
> = (stream, command) => {
  stream.appendEventTxnReportedInBaseCurrency({
    amount: command.amount,
    currency: command.currency,
    session: command.session,
    baseCurrencyAmount: command.baseCurrencyAmount,
    exchangeRate: command.exchangeRate,
    account: command.account,
    reportDate: command.reportDate,
  });
};
