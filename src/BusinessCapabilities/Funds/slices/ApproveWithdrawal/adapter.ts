import type { ApproveWithdrawal } from "./command.js";
import { handleApproveWithdrawal } from "./commandHandler.js";
import { CommandHandlerOrchestratorFactory } from "../../../../types/abstractions/commands/CommandHandlerOrchestratorFactory.js";
import type { CommandHandlerOrchestrator } from "../../../../types/abstractions/commands/commandHandler.js";
import FundsStreamFactory from "../../swimlanes/Funds/index.js";
import { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";

/**
 * Creates the CommandAdapter for the ApproveWithdrawal slice.
 *
 * Wires the pure handler to its stream type and event store.
 * The event store is injected — never imported as a global singleton.
 */
export function createApproveWithdrawalAdapter(storageAdapter: IEvDbStorageAdapter): CommandHandlerOrchestrator<ApproveWithdrawal> {
  return CommandHandlerOrchestratorFactory.create(
    storageAdapter,
    FundsStreamFactory,
    (command: ApproveWithdrawal) => command.account,
    handleApproveWithdrawal,
  );
}
