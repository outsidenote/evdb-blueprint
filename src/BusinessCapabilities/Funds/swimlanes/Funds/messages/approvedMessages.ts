import type { IFundsWithdrawalApproved } from "../events/FundsWithdrawalApproved.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import { QUEUE_NAME as CALCULATE_WITHDRAW_COMMISSION_QUEUE } from "../../../endpoints/CalculateWithdrawComission/pg-boss/index.js";
import { createPgBossQueueMessageFromMetadata } from "../../../../../types/abstractions/endpoints/queueMessage.js";
import { createIdempotencyMessageFromMetadata } from "../../../../../types/abstractions/endpoints/idempotencyMessage.js";
import type { WithdrawalsInProcessViewState } from "../views/WithdrawalsInProcess/state.js";
import type { SliceStateApprovalWithdrawalViewState } from "../views/SliceStateApproveWithdrawal/state.js";
import type { AccountBalanceViewState } from "../views/AccountBalance/state.js";

export const withdrawalApprovedMessages = (
  payload: Readonly<IFundsWithdrawalApproved>,
  _views: Readonly<
    Record<"WithdrawalsInProcess", WithdrawalsInProcessViewState> &
    Record<"SliceStateApproveWithdrawal", SliceStateApprovalWithdrawalViewState> &
    Record<"AccountBalance", AccountBalanceViewState>
  >,
  metadata: IEvDbEventMetadata,
) => {
  const { account, amount, currency, transactionId } = payload;

  return [
    createPgBossQueueMessageFromMetadata(
      [CALCULATE_WITHDRAW_COMMISSION_QUEUE],
      metadata,
      "CalculateWithdrawCommission",
      { account, amount, currency, transactionId },
    ),
    EvDbMessage.createFromMetadata(metadata, "FundsWithdrawalApproved", { account, amount, currency, transactionId }),
    createIdempotencyMessageFromMetadata(metadata, transactionId, "ApproveWithdrawal"),
  ];
};
