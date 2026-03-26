import type { IFundsWithdrawActionRecorded } from "../events/FundsWithdrawActionRecorded.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import { createIdempotencyMessageFromMetadata } from "../../../../../types/abstractions/endpoints/idempotencyMessage.js";

export const fundsWithdrawActionRecordedMessages = (
  payload: Readonly<IFundsWithdrawActionRecorded>,
  _views: Readonly<Record<string, never>>,
  metadata: IEvDbEventMetadata,
) => {
  const { transactionId } = payload;

  return [
    createIdempotencyMessageFromMetadata(metadata, transactionId, "RecordFundWithdrawAction"),
  ];
};
