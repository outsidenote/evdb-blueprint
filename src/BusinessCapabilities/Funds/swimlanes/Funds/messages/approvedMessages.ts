import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type { FundsWithdrawalApproved } from "../events/FundsWithdrawalApproved.js";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import { buildQueueName } from "../../../../../types/abstractions/endpoints/PgBossEndpointIdentity.js";
import { endpointIdentity as calculateWithdrawCommissionEndpoint } from "../../../endpoints/CalculateWithdrawComission/pg-boss/index.js";
import { createPgBossQueueMessageFromEvent } from "../../../../../types/abstractions/endpoints/queueMessage.js";
import { createIdempotencyMessageFromEvent } from "../../../../../types/abstractions/endpoints/idempotencyMessage.js";

export const withdrawalApprovedMessages = (
  event: EvDbEvent,
  _viewStates: Readonly<Record<string, unknown>>,
) => {
  const { account, amount, currency, transactionId } = event.payload as FundsWithdrawalApproved;
  const payload = { payloadType: "CalculateWithdrawCommission", account, amount, currency, transactionId };

  return [
    createPgBossQueueMessageFromEvent([buildQueueName(calculateWithdrawCommissionEndpoint)], event, payload),
    EvDbMessage.createFromEvent(event, { payloadType: "FundsWithdrawalApproved", account, amount, currency, transactionId }),
    createIdempotencyMessageFromEvent(event, transactionId, "ApproveWithdrawal"),
  ];
};
