import { defineAutomationEndpoint } from "#abstractions/endpoints/defineAutomationEndpoint.js";
import { createRecordFundWithdrawActionAdapter } from "#BusinessCapabilities/FraudAnalysis/slices/RecordFundWithdrawAction/adapter.js";

interface FundsWithdrawnPayload {
  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
  readonly transactionId: string;
}

const worker = defineAutomationEndpoint({
  source: "message",
  messageType: "FundsWithdrawn",
  handlerName: "RecordFundWithdrawAction",
  kafkaTopic: "events.FundsWithdrawn",
  createAdapter: createRecordFundWithdrawActionAdapter,
  getIdempotencyKey: (payload: FundsWithdrawnPayload) => payload.transactionId,
  mapPayloadToCommand: (payload: FundsWithdrawnPayload) => ({
    commandType: "RecordFundWithdrawAction" as const,
    account: payload.account,
    amount: payload.amount + payload.commission,
    currency: payload.currency,
    transactionId: payload.transactionId,
  }),
});

export const endpointIdentity = worker.endpointIdentity;
export const createFundsWithdrawnWorker = worker.create;
