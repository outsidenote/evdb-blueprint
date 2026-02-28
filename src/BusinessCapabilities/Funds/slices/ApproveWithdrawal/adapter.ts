import type { WithdrawalApprovalStreamType } from "../../swimlanes/WithdrawalApprovalsStream/index.js";
import type { ApproveWithdrawal } from "./command.js";
import { handleApproveWithdrawal } from "./commandHandler.js";
import { CommandHandlerOrchestratorFactory } from "../../../../types/CommandHandlerOrchestratorFactory.js";
import type { EventStorePort } from "../../../../types/CommandHandlerOrchestratorFactory.js";
import type { CommandHandlerOrchestrator } from "../../../../types/commandHandler.js";
import WithdrawalApprovalStreamFactory from "../../swimlanes/WithdrawalApprovalsStream/index.js";
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
    WithdrawalApprovalStreamFactory,
    (command: ApproveWithdrawal) => command.account,
    handleApproveWithdrawal,
  );
}
