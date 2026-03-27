import type { IFundsWithdrawalDeclined } from "../events/FundsWithdrawalDeclined.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type { FundsViews } from "../views/FundsViews.js";

export const withdrawalDeclinedMessages = (
  payload: Readonly<IFundsWithdrawalDeclined>,
  _views: FundsViews,
  metadata: IEvDbEventMetadata,
) => {
  return [
    EvDbMessage.createFromMetadata(metadata, "WithdrawalDeclinedNotification", {
      account: payload.account,
      amount: payload.amount,
      reason: payload.reason,
      currency: payload.currency,
    }),
  ];
};
