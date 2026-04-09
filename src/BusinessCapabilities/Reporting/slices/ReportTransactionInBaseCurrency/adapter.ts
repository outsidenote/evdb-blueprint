import type { ReportTransactionInBaseCurrency } from "./command.js";
import { handleReportTransactionInBaseCurrency } from "./commandHandler.js";
import { CommandHandlerOrchestratorFactory } from "#abstractions/commands/CommandHandlerOrchestratorFactory.js";
import type { CommandHandlerOrchestrator } from "#abstractions/commands/commandHandler.js";
import ReportingStreamFactory from "#BusinessCapabilities/Reporting/swimlanes/Reporting/index.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";

export function createReportTransactionInBaseCurrencyAdapter(storageAdapter: IEvDbStorageAdapter): CommandHandlerOrchestrator<ReportTransactionInBaseCurrency> {
  return CommandHandlerOrchestratorFactory.create(
    storageAdapter,
    ReportingStreamFactory,
    (command: ReportTransactionInBaseCurrency) => command.account,
    handleReportTransactionInBaseCurrency,
  );
}
