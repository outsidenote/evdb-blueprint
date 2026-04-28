import type { AssessLoanRisk } from "./command.js";
import { handleAssessLoanRisk } from "./commandHandler.js";
import { CommandHandlerOrchestratorFactory } from "#abstractions/commands/CommandHandlerOrchestratorFactory.js";
import type { CommandHandlerOrchestrator } from "#abstractions/commands/commandHandler.js";
import PortfolioStreamFactory from "#BusinessCapabilities/Portfolio/swimlanes/Portfolio/index.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";

export function createAssessLoanRiskAdapter(storageAdapter: IEvDbStorageAdapter): CommandHandlerOrchestrator<AssessLoanRisk> {
  return CommandHandlerOrchestratorFactory.create(
    storageAdapter,
    PortfolioStreamFactory,
    (command: AssessLoanRisk) => command.portfolioId,
    handleAssessLoanRisk,
  );
}
