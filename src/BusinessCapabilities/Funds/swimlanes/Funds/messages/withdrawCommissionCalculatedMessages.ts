import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type { WithdrawCommissionCalculated } from "../events/WithdrawCommissionCalculated.js";
import { QUEUE_NAME as WITHDRAW_FUNDS_QUEUE } from "../../../endpoints/WithdrawFunds/pg-boss/index.js";
import { createPgBossQueueMessageFromEvent } from "../../../../../types/QueueMessage.js";
import { createIdempotencyMessageFromEvent } from "../../../../../types/IdempotencyMessage.js";

export const withdrawCommissionCalculatedMessages = (
  event: EvDbEvent,
  _viewStates: Readonly<Record<string, unknown>>,
) => {
  const { account, amount, commission, currency, transactionId } = event.payload as WithdrawCommissionCalculated;
  const payload = { payloadType: "WithdrawFunds", account, amount, commission, currency };

  return [
    createPgBossQueueMessageFromEvent([WITHDRAW_FUNDS_QUEUE], event, payload),
    createIdempotencyMessageFromEvent(event, transactionId, "CalculateWithdrawCommission"),
  ];
};
