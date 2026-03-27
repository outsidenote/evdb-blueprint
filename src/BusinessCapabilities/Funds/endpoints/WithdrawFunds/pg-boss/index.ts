import { defineAutomationEndpoint } from "../../../../../types/abstractions/endpoints/defineAutomationEndpoint.js";
import { createWithdrawFundsAdapter } from "../../../slices/WithdrawFunds/adapter.js";

interface WithdrawCommissionCalculatedPayload {
  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
  readonly transactionId: string;
}

const worker = defineAutomationEndpoint<WithdrawCommissionCalculatedPayload>({
  source: "event",
  eventType: "WithdrawCommissionCalculated",
  handlerName: "WithdrawFunds",
  createAdapter: createWithdrawFundsAdapter,
  getIdempotencyKey: (payload) => payload.transactionId,
  mapPayloadToCommand: (payload) => ({
    commandType: "WithdrawFunds" as const,
    account: payload.account,
    amount: payload.amount,
    commission: payload.commission,
    currency: payload.currency,
    transactionId: payload.transactionId,
  }),
});

export const endpointIdentity = worker.endpointIdentity;
export const createWithdrawCommissionCalculatedWorker = worker.create;
