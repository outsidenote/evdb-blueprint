import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type { FundsWithdrawalApproved } from "../events/FundsWithdrawalApproved.js";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";

export const withdrawalApprovedMessages = (
  event: EvDbEvent,
  _viewStates: Readonly<Record<string, unknown>>,
) => {
  const payload = event.payload as FundsWithdrawalApproved;

  return [
    EvDbMessage.createFromEvent(event, {
      payloadType: "Withdrawal Approved Notification",
      account: payload.account,
      amount: payload.amount,
      currency: payload.currency,
    }),
  ];
};
