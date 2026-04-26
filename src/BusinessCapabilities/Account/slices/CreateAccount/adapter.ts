import type { CreateAccount } from "./command.js";
import { handleCreateAccount } from "./commandHandler.js";
import { CommandHandlerOrchestratorFactory } from "#abstractions/commands/CommandHandlerOrchestratorFactory.js";
import type { CommandHandlerOrchestrator } from "#abstractions/commands/commandHandler.js";
import AccountStreamFactory from "#BusinessCapabilities/Account/swimlanes/Account/index.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";

export function createCreateAccountAdapter(storageAdapter: IEvDbStorageAdapter): CommandHandlerOrchestrator<CreateAccount> {
  return CommandHandlerOrchestratorFactory.create(
    storageAdapter,
    AccountStreamFactory,
    (command: CreateAccount) => command.accountId,
    handleCreateAccount,
  );
}
