import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type { FundsWithdrawalApproved } from "../events/FundsWithdrawalApproved.js";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import { QUEUE_NAME as CALCULATE_WITHDRAW_COMMISSION_QUEUE, CHANNEL } from "../../../endpoints/CalculateWithdrawComission/pg-boss/index.js";

export const withdrawalApprovedMessages = (
  event: EvDbEvent,
  _viewStates: Readonly<Record<string, unknown>>,
) => {
  const payload = event.payload as FundsWithdrawalApproved;

  return [
    EvDbMessage.createFromEvent(event, {
      payloadType: "FundsWithdrawalApproved",
      queues: [CALCULATE_WITHDRAW_COMMISSION_QUEUE],
      message: {
        account: payload.account,
        amount: payload.amount,
        currency: payload.currency,
      },
    }, CHANNEL),
  ];
};
