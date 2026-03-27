import type { IWithdrawCommissionCalculated } from "../events/WithdrawCommissionCalculated.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import { QUEUE_NAME as WITHDRAW_FUNDS_QUEUE } from "../../../endpoints/WithdrawFunds/pg-boss/index.js";
import { createPgBossQueueMessageFromMetadata } from "../../../../../types/abstractions/endpoints/queueMessage.js";
import { createIdempotencyMessageFromMetadata } from "../../../../../types/abstractions/endpoints/idempotencyMessage.js";
import type { FundsViews } from "../views/FundsViews.js";

export const withdrawCommissionCalculatedMessages = (
  payload: Readonly<IWithdrawCommissionCalculated>,
  _views: FundsViews,
  metadata: IEvDbEventMetadata,
) => {
  const { account, amount, commission, currency, transactionId } = payload;

  return [
    createPgBossQueueMessageFromMetadata(
      [WITHDRAW_FUNDS_QUEUE],
      metadata,
      "WithdrawFunds",
      { account, amount, commission, currency, transactionId },
    ),
    createIdempotencyMessageFromMetadata(metadata, transactionId, "CalculateWithdrawCommission"),
  ];
};
