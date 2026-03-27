import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type { WithdrawCommissionCalculated } from "../events/WithdrawCommissionCalculated.js";
import { buildQueueName } from "../../../../../types/abstractions/endpoints/PgBossEndpointIdentity.js";
import { endpointIdentity as withdrawFundsEndpoint } from "../../../endpoints/WithdrawFunds/pg-boss/index.js";
import { createPgBossQueueMessageFromEvent } from "../../../../../types/abstractions/endpoints/queueMessage.js";
import { createIdempotencyMessageFromEvent } from "../../../../../types/abstractions/endpoints/idempotencyMessage.js";

export const withdrawCommissionCalculatedMessages = (
  event: EvDbEvent,
  _viewStates: Readonly<Record<string, unknown>>,
) => {
  const { account, amount, commission, currency, transactionId } = event.payload as WithdrawCommissionCalculated;
  const payload = { payloadType: "WithdrawFunds", account, amount, commission, currency, transactionId };

  return [
    createPgBossQueueMessageFromEvent([buildQueueName(withdrawFundsEndpoint)], event, payload),
    createIdempotencyMessageFromEvent(event, transactionId, "CalculateWithdrawCommission"),
  ];
};
