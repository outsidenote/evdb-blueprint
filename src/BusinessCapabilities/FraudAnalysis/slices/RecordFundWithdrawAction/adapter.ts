import type { RecordFundWithdrawAction } from "./command.js";
import { handleRecordFundWithdrawAction } from "./commandHandler.js";
import { CommandHandlerOrchestratorFactory } from "../../../../types/CommandHandlerOrchestratorFactory.js";
import type { CommandHandlerOrchestrator } from "../../../../types/commandHandler.js";
import FraudAnalysisStreamFactory from "../../swimlanes/FraudAnalysis/index.js";
import { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";

/**
 * Creates the CommandAdapter for the RecordFundWithdrawAction slice.
 *
 * Wires the pure handler to the FraudAnalysis stream type and event store.
 * The aggregate is keyed by account (e.g. *account:UUID).
 */
export function createRecordFundWithdrawActionAdapter(storageAdapter: IEvDbStorageAdapter): CommandHandlerOrchestrator<RecordFundWithdrawAction> {
  return CommandHandlerOrchestratorFactory.create(
    storageAdapter,
    FraudAnalysisStreamFactory,
    (command: RecordFundWithdrawAction) => command.account,
    handleRecordFundWithdrawAction,
  );
}
