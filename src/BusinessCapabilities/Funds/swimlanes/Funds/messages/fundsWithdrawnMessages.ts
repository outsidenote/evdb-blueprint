import type { IFundsWithdrawn } from "../events/FundsWithdrawn.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import { createIdempotencyMessageFromMetadata } from "#abstractions/endpoints/idempotencyMessage.js";
import type { FundsViews } from "../views/FundsViews.js";

export const fundsWithdrawnMessages = (
  payload: Readonly<IFundsWithdrawn>,
  _views: FundsViews,
  metadata: IEvDbEventMetadata,
) => {
  return [
    EvDbMessage.createFromMetadata(metadata, "FundsWithdrawn", {
      account: payload.account,
      amount: payload.amount,
      commission: payload.commission,
      currency: payload.currency,
      transactionId: payload.transactionId,
    }),
    createIdempotencyMessageFromMetadata(metadata, payload.transactionId, "WithdrawFunds"),
  ];
};
