import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type { FundsWithdrawn } from "../events/FundsWithdrawn.js";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import { createIdempotencyMessageFromEvent } from "../../../../../types/abstractions/endpoints/idempotencyMessage.js";

export const fundsWithdrawnMessages = (
  event: EvDbEvent,
  _viewStates: Readonly<Record<string, unknown>>,
) => {
  const payload = event.payload as FundsWithdrawn;

  return [
    EvDbMessage.createFromEvent(event, {
      payloadType: "FundsWithdrawn",
      account: payload.account,
      amount: payload.amount,
      commission: payload.commission,
      currency: payload.currency,
      transactionId: payload.transactionId,
    }),
    createIdempotencyMessageFromEvent(event, payload.transactionId, "WithdrawFunds"),
  ];
};
