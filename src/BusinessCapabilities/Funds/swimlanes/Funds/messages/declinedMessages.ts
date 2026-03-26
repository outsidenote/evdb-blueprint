import type { FundsWithdrawalDeclined } from "../events/FundsWithdrawalDeclined.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type { WithdrawalsInProcessViewState } from "../views/WithdrawalsInProcess/state.js";
import type { SliceStateApprovalWithdrawalViewState } from "../views/SliceStateApproveWithdrawal/state.js";
import type { AccountBalanceViewState } from "../views/AccountBalance/state.js";

export const withdrawalDeclinedMessages = (
  payload: Readonly<FundsWithdrawalDeclined>,
  views: Readonly<Record<"WithdrawalsInProcess", WithdrawalsInProcessViewState> &
    Record<"SliceStateApproveWithdrawal", SliceStateApprovalWithdrawalViewState> &
    Record<"AccountBalance", AccountBalanceViewState>>,
  metadata: IEvDbEventMetadata,
) => {
  return [
    EvDbMessage.createFromMetadata(metadata,
      "WithdrawalDeclinedNotification",{
      account: payload.account,
      amount: payload.amount,
      reason: payload.reason,
      currency: payload.currency,
    }),
  ];
};
