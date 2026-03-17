import type { ApproveWithdrawal } from "./command.js";
import { handleApproveWithdrawal } from "./commandHandler.js";
import { CommandHandlerOrchestratorFactory } from "../../../../types/CommandHandlerOrchestratorFactory.js";
import type { CommandHandlerOrchestrator } from "../../../../types/commandHandler.js";
import { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";

/**
 * Creates the CommandAdapter for the ApproveWithdrawal slice.
 *
 * Wires the pure handler to its stream type and event store.
 * The event store is injected — never imported as a global singleton.
 */
export async function createApproveWithdrawalAdapter(storageAdapter: IEvDbStorageAdapter): Promise<CommandHandlerOrchestrator<ApproveWithdrawal>> {
  const { FundsStreamFactory } = await import("../../swimlanes/Funds/index.js");
  return CommandHandlerOrchestratorFactory.create(
    storageAdapter,
    FundsStreamFactory,
    (command: ApproveWithdrawal) => command.account,
    handleApproveWithdrawal,
  );
}
