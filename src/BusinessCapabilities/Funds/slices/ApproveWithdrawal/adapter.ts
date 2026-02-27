import type { WithdrawalApprovalStreamType } from "../../swimlanes/WithdrawalApprovalsStream/index.js";
import type { ApproveWithdrawal } from "./command.js";
import { handleApproveWithdrawal } from "./commandHandler.js";
import { CommandHandlerOrchestratorFactory } from "../../../../types/CommandHandlerOrchestratorFactory.js";
import type { EventStorePort } from "../../../../types/CommandHandlerOrchestratorFactory.js";
import type { CommandHandlerOrchestrator } from "../../../../types/commandHandler.js";

/**
 * Creates the CommandAdapter for the ApproveWithdrawal slice.
 *
 * Wires the pure handler to its stream type and event store.
 * The event store is injected — never imported as a global singleton.
 */
export function createApproveWithdrawalAdapter(eventStore: EventStorePort): CommandHandlerOrchestrator<ApproveWithdrawal> {
  return CommandHandlerOrchestratorFactory.create<WithdrawalApprovalStreamType, ApproveWithdrawal>(
    eventStore,
    "WithdrawalApprovalStream",
    (command) => command.account,
    handleApproveWithdrawal,
  );
}
