import { defineAutomationEndpoint } from "#abstractions/endpoints/defineAutomationEndpoint.js";
import { createReportTransactionInBaseCurrencyAdapter } from "#BusinessCapabilities/Reporting/slices/ReportTransactionInBaseCurrency/adapter.js";
import { enrich } from "../enrichment.js";

interface FundsWithdrawnPayload {
  readonly account: string;
  readonly amount: number;
  readonly currency: string;
  readonly session: string;
}

const worker = defineAutomationEndpoint({
  source: "message",
  messageType: "FundsWithdrawn",
  kafkaTopic: "events.FundsWithdrawn",
  handlerName: "ReportTransactionInBaseCurrency",
  createAdapter: createReportTransactionInBaseCurrencyAdapter,
  getIdempotencyKey: (payload: FundsWithdrawnPayload) => payload.session,
  mapPayloadToCommand: async (payload: FundsWithdrawnPayload) => {
    const enriched = await enrich(payload);
    return {
    commandType: "ReportTransactionInBaseCurrency" as const,
    account: payload.account,
    amount: payload.amount,
    baseCurrencyAmount: enriched.baseCurrencyAmount,
    currency: payload.currency,
    exchangeRate: enriched.exchangeRate,
    reportDate: enriched.reportDate,
    session: payload.session,
    };
  },
});

export const endpointIdentity = worker.endpointIdentity;
export const createFundsWithdrawnWorker = worker.create;
