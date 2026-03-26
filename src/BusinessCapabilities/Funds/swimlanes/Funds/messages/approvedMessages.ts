import type { FundsWithdrawalApproved } from "../events/FundsWithdrawalApproved.js";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import { QUEUE_NAME as CALCULATE_WITHDRAW_COMMISSION_QUEUE } from "../../../endpoints/CalculateWithdrawComission/pg-boss/index.js";
import { createPgBossQueueMessage } from "../../../../../types/abstractions/endpoints/createPgBossQueueMessage.js";
import { createIdempotencyMessageFromMetadata } from "../../../../../types/abstractions/endpoints/createIdempotencyMessageFromMetadata.js";
import type { SliceStateApprovalWithdrawalViewState } from "../views/SliceStateApproveWithdrawal/state.js";
import type { WithdrawalsInProcessViewState } from "../views/WithdrawalsInProcess/state.js";
import type { AccountBalanceViewState } from "../views/AccountBalance/state.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";

export const withdrawalApprovedMessages = (
  event: Readonly<FundsWithdrawalApproved>,
  _viewStates: Readonly<Record<"WithdrawalsInProcess", WithdrawalsInProcessViewState> &
    Record<"SliceStateApproveWithdrawal", SliceStateApprovalWithdrawalViewState> &
    Record<"AccountBalance", AccountBalanceViewState>>,
  metadata: IEvDbEventMetadata
) => {
  const { account, amount, currency, transactionId } = event;
  const payload = { payloadType: "CalculateWithdrawCommission", account, amount, currency, transactionId };

  return [
    createPgBossQueueMessage([CALCULATE_WITHDRAW_COMMISSION_QUEUE], metadata, payload),
    EvDbMessage.createFromMetadata(metadata,"FundsWithdrawalApproved", { account, amount, currency, transactionId }),
    createIdempotencyMessageFromMetadata(metadata, transactionId, "ApproveWithdrawal"),
  ];
};
