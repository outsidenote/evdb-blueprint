import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type { FundsWithdrawActionRecorded } from "../events/FundsWithdrawActionRecorded.js";
import { createIdempotencyMessageFromEvent } from "../../../../../types/IdempotencyMessage.js";

export const fundsWithdrawActionRecordedMessages = (
  event: EvDbEvent,
  _viewStates: Readonly<Record<string, unknown>>,
) => {
  const { transactionId } = event.payload as FundsWithdrawActionRecorded;

  return [
    createIdempotencyMessageFromEvent(event, transactionId, "RecordFundWithdrawAction"),
  ];
};
