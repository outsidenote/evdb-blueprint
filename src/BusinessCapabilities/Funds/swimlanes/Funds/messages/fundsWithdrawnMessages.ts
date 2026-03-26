import type { IFundsWithdrawn } from "../events/FundsWithdrawn.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import { createIdempotencyMessageFromMetadata } from "../../../../../types/abstractions/endpoints/idempotencyMessage.js";
import type { WithdrawalsInProcessViewState } from "../views/WithdrawalsInProcess/state.js";
import type { SliceStateApprovalWithdrawalViewState } from "../views/SliceStateApproveWithdrawal/state.js";
import type { AccountBalanceViewState } from "../views/AccountBalance/state.js";

export const fundsWithdrawnMessages = (
  payload: Readonly<IFundsWithdrawn>,
  _views: Readonly<
    Record<"WithdrawalsInProcess", WithdrawalsInProcessViewState> &
    Record<"SliceStateApproveWithdrawal", SliceStateApprovalWithdrawalViewState> &
    Record<"AccountBalance", AccountBalanceViewState>
  >,
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
