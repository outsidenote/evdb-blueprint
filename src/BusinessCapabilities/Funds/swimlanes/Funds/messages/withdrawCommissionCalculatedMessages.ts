import type { WithdrawCommissionCalculated } from "../events/WithdrawCommissionCalculated.js";
import { QUEUE_NAME as WITHDRAW_FUNDS_QUEUE } from "../../../endpoints/WithdrawFunds/pg-boss/index.js";
import { createPgBossQueueMessage } from "../../../../../types/abstractions/endpoints/createPgBossQueueMessage.js";
import { createIdempotencyMessageFromMetadata } from "../../../../../types/abstractions/endpoints/createIdempotencyMessageFromMetadata.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type { WithdrawalsInProcessViewState } from "../views/WithdrawalsInProcess/state.js";
import type { SliceStateApprovalWithdrawalViewState } from "../views/SliceStateApproveWithdrawal/state.js";
import type { AccountBalanceViewState } from "../views/AccountBalance/state.js";

export const withdrawCommissionCalculatedMessages = (
  payload: Readonly<WithdrawCommissionCalculated>,
  views: Readonly<Record<"WithdrawalsInProcess", WithdrawalsInProcessViewState> &
    Record<"SliceStateApproveWithdrawal", SliceStateApprovalWithdrawalViewState> &
    Record<"AccountBalance", AccountBalanceViewState>>,
  metadata: IEvDbEventMetadata
) => {
  return [
    createPgBossQueueMessage([WITHDRAW_FUNDS_QUEUE], metadata, payload, "WithdrawFunds"),
    createIdempotencyMessageFromMetadata(metadata, payload.transactionId, "CalculateWithdrawCommission"),
  ];
};
