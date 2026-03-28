import { defineAutomationEndpoint } from "#abstractions/endpoints/defineAutomationEndpoint.js";
import { createCalculateWithdrawCommissionAdapter } from "#BusinessCapabilities/Funds/slices/CalculateWithdrawCommission/adapter.js";
import { enrich } from "../enrichment.js";

interface FundsWithdrawalApprovedPayload {
  readonly account: string;
  readonly amount: number;
  readonly currency: string;
  readonly transactionId: string;
}

const worker = defineAutomationEndpoint({
  source: "event",
  messageType: "FundsWithdrawalApproved",
  handlerName: "CalculateWithdrawCommission",
  createAdapter: createCalculateWithdrawCommissionAdapter,
  getIdempotencyKey: (payload: FundsWithdrawalApprovedPayload) => payload.transactionId,
  mapPayloadToCommand: (payload: FundsWithdrawalApprovedPayload) => enrich({
    account: payload.account,
    amount: payload.amount,
    currency: payload.currency,
    session: "worker",
    source: "outbox",
    payer: "unknown",
    approvalDate: new Date(),
    transactionId: payload.transactionId,
    transactionTime: new Date(),
  }),
});

export const endpointIdentity = worker.endpointIdentity;
export const createFundsWithdrawalApprovedWorker = worker.create;
