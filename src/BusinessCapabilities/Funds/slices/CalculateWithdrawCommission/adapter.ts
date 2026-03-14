import type { CalculateWithdrawCommissionCommand } from "./command.js";
import { handleCalculateWithdrawCommission } from "./commandHandler.js";
import { CommandHandlerOrchestratorFactory } from "../../../../types/CommandHandlerOrchestratorFactory.js";
import type { CommandHandlerOrchestrator } from "../../../../types/commandHandler.js";
import FundsStreamFactory from "../../swimlanes/Funds/index.js";
import { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";

/**
 * Creates the CommandAdapter for the ApproveWithdrawal slice.
 *
 * Wires the pure handler to its stream type and event store.
 * The event store is injected — never imported as a global singleton.
 */
export function createCalculateWithdrawCommissionAdapter(storageAdapter: IEvDbStorageAdapter): CommandHandlerOrchestrator<CalculateWithdrawCommissionCommand> {
  return CommandHandlerOrchestratorFactory.create(
    storageAdapter,
    FundsStreamFactory,
    (command: CalculateWithdrawCommissionCommand) => command.account,
    handleCalculateWithdrawCommission,
  );
}
