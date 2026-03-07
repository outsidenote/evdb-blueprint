import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type { FundsWithdrew } from "../events/FundsWithdrew.js";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";

export const fundsWithdrewMessages = (
  event: EvDbEvent,
  _viewStates: Readonly<Record<string, unknown>>,
) => {
  const payload = event.payload as FundsWithdrew;

  return [
    EvDbMessage.createFromEvent(event, {
      payloadType: "FundsWithdrew",
      account: payload.account,
      amount: payload.amount,
      commission: payload.commission,
      currency: payload.currency,
      session: payload.session,
    }),
  ];
};
