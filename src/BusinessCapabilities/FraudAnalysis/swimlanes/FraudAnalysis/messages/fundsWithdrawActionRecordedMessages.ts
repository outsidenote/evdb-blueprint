import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type { FundsWithdrawActionRecorded } from "../events/FundsWithdrawActionRecorded.js";
import { createIdempotencyMessageFromMetadata } from "../../../../../types/abstractions/endpoints/createIdempotencyMessageFromMetadata.js";

export const fundsWithdrawActionRecordedMessages = (
  event: EvDbEvent,
  _viewStates: Readonly<Record<string, unknown>>,
) => {
  const { transactionId } = event.payload as FundsWithdrawActionRecorded;

  return [
    createIdempotencyMessageFromMetadata(event, transactionId, "RecordFundWithdrawAction"),
  ];
};
