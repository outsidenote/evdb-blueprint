import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type { FundsWithdrawalApproved } from "../events/FundsWithdrawalApproved.js";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import { QUEUE_NAME as CALCULATE_WITHDRAW_COMMISSION_QUEUE } from "../../../endpoints/CalculateWithdrawComission/pg-boss/index.js";
import { createPgBossQueueMessageFromEvent } from "../../../../../types/QueueMessage.js";
import { createIdempotencyMessageFromEvent } from "../../../../../types/IdempotencyMessage.js";

export const withdrawalApprovedMessages = (
  event: EvDbEvent,
  _viewStates: Readonly<Record<string, unknown>>,
) => {
  const { account, amount, currency, transactionId } = event.payload as FundsWithdrawalApproved;
  const payload = { payloadType: "CalculateWithdrawCommission", account, amount, currency, transactionId };

  return [
    createPgBossQueueMessageFromEvent([CALCULATE_WITHDRAW_COMMISSION_QUEUE], event, payload),
    EvDbMessage.createFromEvent(event, { payloadType: "FundsWithdrawalApproved", account, amount, currency, transactionId }),
    createIdempotencyMessageFromEvent(event, transactionId, "ApproveWithdrawal"),
  ];
};
