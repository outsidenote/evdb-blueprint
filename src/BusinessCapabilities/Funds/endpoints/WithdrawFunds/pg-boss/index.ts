import { defineAutomationEndpoint } from "#abstractions/endpoints/defineAutomationEndpoint.js";
import { createWithdrawFundsAdapter } from "#BusinessCapabilities/Funds/slices/WithdrawFunds/adapter.js";

interface WithdrawCommissionCalculatedPayload {
  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
  readonly transactionId: string;
}

const worker = defineAutomationEndpoint({
  source: "event",
  eventType: "WithdrawCommissionCalculated",
  handlerName: "WithdrawFunds",
  createAdapter: createWithdrawFundsAdapter,
  getIdempotencyKey: (payload: WithdrawCommissionCalculatedPayload) => payload.transactionId,
  mapPayloadToCommand: (payload: WithdrawCommissionCalculatedPayload) => ({
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
