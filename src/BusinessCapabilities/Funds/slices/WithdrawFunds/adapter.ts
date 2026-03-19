import type { WithdrawFunds } from "./command.js";
import { handleWithdrawFunds } from "./commandHandler.js";
import { CommandHandlerOrchestratorFactory } from "../../../../types/abstractions/commands/CommandHandlerOrchestratorFactory.js";
import type { CommandHandlerOrchestrator } from "../../../../types/abstractions/commands/commandHandler.js";
import FundsStreamFactory from "../../swimlanes/Funds/index.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";

/**
 * Creates the CommandAdapter for the WithdrawFunds slice.
 *
 * Wires the pure handler to its stream type and event store.
 * The event store is injected — never imported as a global singleton.
 */
export function createWithdrawFundsAdapter(storageAdapter: IEvDbStorageAdapter): CommandHandlerOrchestrator<WithdrawFunds> {
  return CommandHandlerOrchestratorFactory.create(
    storageAdapter,
    FundsStreamFactory,
    (command: WithdrawFunds) => command.account,
    handleWithdrawFunds,
  );
}
