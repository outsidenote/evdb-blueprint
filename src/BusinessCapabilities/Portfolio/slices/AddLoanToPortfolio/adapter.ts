import type { AddLoanToPortfolio } from "./command.js";
import { handleAddLoanToPortfolio } from "./commandHandler.js";
import { CommandHandlerOrchestratorFactory } from "#abstractions/commands/CommandHandlerOrchestratorFactory.js";
import type { CommandHandlerOrchestrator } from "#abstractions/commands/commandHandler.js";
import PortfolioStreamFactory from "#BusinessCapabilities/Portfolio/swimlanes/Portfolio/index.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";

export function createAddLoanToPortfolioAdapter(storageAdapter: IEvDbStorageAdapter): CommandHandlerOrchestrator<AddLoanToPortfolio> {
  return CommandHandlerOrchestratorFactory.create(
    storageAdapter,
    PortfolioStreamFactory,
    (command: AddLoanToPortfolio) => command.portfolioId,
    handleAddLoanToPortfolio,
  );
}
