import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type { WithdrawalApprovalStreamType } from "../../eventstore/WithdrawalApprovalsStream/index.js";
import type { ApproveWithdrawal } from "./command.js";
import { handleApproveWithdrawal } from "./commandHandler.js";
import { createCommandAdapter } from "../../types/createCommandAdapter.js";
import type { EventStorePort } from "../../types/createCommandAdapter.js";
import type { CommandAdapter } from "../../types/commandHandler.js";

/**
 * Creates the CommandAdapter for the ApproveWithdrawal slice.
 *
 * Wires the pure handler to its stream type and event store.
 * The event store is injected — never imported as a global singleton.
 */
export function createApproveWithdrawalAdapter(eventStore: EventStorePort): CommandAdapter<ApproveWithdrawal, EvDbEvent> {
  return createCommandAdapter<WithdrawalApprovalStreamType, ApproveWithdrawal>(
    eventStore,
    "WithdrawalApprovalStream",
    (command) => command.account,
    handleApproveWithdrawal,
  );
}
