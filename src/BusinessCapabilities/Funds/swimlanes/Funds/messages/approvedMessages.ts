import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type { FundsWithdrawalApproved } from "../events/FundsWithdrawalApproved.js";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import { QUEUE_NAME as CALCULATE_WITHDRAW_COMMISSION_QUEUE } from "../../../endpoints/CalculateWithdrawComission/pg-boss/index.js";
import { createPgBossQueueMessageFromEvent } from "../../../../../types/QueueMessage.js";

export const withdrawalApprovedMessages = (
  event: EvDbEvent,
  _viewStates: Readonly<Record<string, unknown>>,
) => {
  const { account, amount, currency, session } = event.payload as FundsWithdrawalApproved;
  const payload = { payloadType: "CalculateWithdrawCommission", account, amount, currency };

  return [
    createPgBossQueueMessageFromEvent([CALCULATE_WITHDRAW_COMMISSION_QUEUE], event, payload),
    // Also emit to Kafka (default channel) so the PendingWithdrawalLookup projection can consume it
    EvDbMessage.createFromEvent(event, {
      payloadType: "FundsWithdrawalApproved",
      account,
      amount,
      currency,
      session,
    }),
  ];
};
