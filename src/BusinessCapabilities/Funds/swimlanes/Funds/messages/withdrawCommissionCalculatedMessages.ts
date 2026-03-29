import type { IWithdrawCommissionCalculated } from "../events/WithdrawCommissionCalculated.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import { endpointIdentity as withdrawFundsEndpoint } from "#BusinessCapabilities/Funds/endpoints/WithdrawFunds/pg-boss/index.js";
import { createPgBossQueueMessageFromMetadata } from "#abstractions/endpoints/queueMessage.js";
import { createIdempotencyMessageFromMetadata } from "#abstractions/endpoints/idempotencyMessage.js";
import type { FundsViews } from "../views/FundsViews.js";

export const withdrawCommissionCalculatedMessages = (
  payload: Readonly<IWithdrawCommissionCalculated>,
  _views: FundsViews,
  metadata: IEvDbEventMetadata,
) => {
  const { account, amount, commission, currency, transactionId } = payload;

  return [
    createPgBossQueueMessageFromMetadata(
      [withdrawFundsEndpoint.queueName],
      metadata,
      "WithdrawFunds",
      { account, amount, commission, currency, transactionId },
    ),
    createIdempotencyMessageFromMetadata(metadata, transactionId, "CalculateWithdrawCommission"),
  ];
};
