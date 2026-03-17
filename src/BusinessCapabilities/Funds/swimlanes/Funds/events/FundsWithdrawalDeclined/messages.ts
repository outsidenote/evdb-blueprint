import type { FundsWithdrawalDeclined } from "./event.js";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";

export const withdrawalDeclinedMessages = (
  event: EvDbEvent,
  _viewStates: Readonly<Record<string, unknown>>,
) => {
  const payload = event.payload as FundsWithdrawalDeclined;

  return [
    EvDbMessage.createFromEvent(event, {
      payloadType: "WithdrawalDeclinedNotification",
      account: payload.account,
      amount: payload.amount,
      reason: payload.reason,
      currency: payload.currency,
    }),
  ];
};
