
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type { FundsWithdrawalApproved } from "../events/FundsWithdrawalApproved.js";

export const withdrawalApprovedMessages = (
  event: EvDbEvent,
  _viewStates: Readonly<Record<string, unknown>>,
) => {
  const payload = event.payload as FundsWithdrawalApproved;

  return [
    EvDbMessage.createFromEvent(event, {
      payloadType: "Withdrawal Approved Notification",
      account: payload.accountId,
      amount: payload.amount,
      currency: payload.currency,
    }),
  ];
};
