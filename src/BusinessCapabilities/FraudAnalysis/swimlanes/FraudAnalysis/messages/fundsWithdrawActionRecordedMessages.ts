import type { IFundsWithdrawActionRecorded } from "../events/FundsWithdrawActionRecorded.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import { createIdempotencyMessageFromMetadata } from "#abstractions/endpoints/idempotencyMessage.js";
import type { FraudAnalysisViews } from "../views/FraudAnalysisViews.js";

export const fundsWithdrawActionRecordedMessages = (
  payload: Readonly<IFundsWithdrawActionRecorded>,
  _views: FraudAnalysisViews,
  metadata: IEvDbEventMetadata,
) => {
  const { transactionId } = payload;

  return [
    createIdempotencyMessageFromMetadata(metadata, transactionId, "RecordFundWithdrawAction"),
  ];
};
