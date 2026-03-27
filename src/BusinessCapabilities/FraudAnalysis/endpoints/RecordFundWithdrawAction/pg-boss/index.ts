import { defineAutomationEndpoint } from "../../../../../types/abstractions/endpoints/defineAutomationEndpoint.js";
import { createRecordFundWithdrawActionAdapter } from "../../../slices/RecordFundWithdrawAction/adapter.js";

interface FundsWithdrawnPayload {
  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
  readonly transactionId: string;
}

const worker = defineAutomationEndpoint<FundsWithdrawnPayload>({
  source: "message",
  eventType: "FundsWithdrawn",
  handlerName: "RecordFundWithdrawAction",
  kafkaTopic: "events.FundsWithdrawn",
  createAdapter: createRecordFundWithdrawActionAdapter,
  getIdempotencyKey: (payload) => payload.transactionId,
  mapPayloadToCommand: (payload) => ({
    commandType: "RecordFundWithdrawAction" as const,
    account: payload.account,
    amount: payload.amount + payload.commission,
    currency: payload.currency,
    transactionId: payload.transactionId,
  }),
});

export const endpointIdentity = worker.endpointIdentity;
export const createFundsWithdrawnWorker = worker.create;
