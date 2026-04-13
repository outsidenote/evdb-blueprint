import { defineAutomationEndpoint } from "#abstractions/endpoints/defineAutomationEndpoint.js";
import { createAssessLoanRiskAdapter } from "#BusinessCapabilities/Portfolio/slices/AssessLoanRisk/adapter.js";
import { enrich } from "../enrichment.js";

interface LoansPendingRiskAssessPayload {
  readonly portfolioId: string;
  readonly borrowerName: string;
  readonly creditRating: string;
  readonly interestRate: number;
  readonly loanAmount: number;
  readonly loanId: string;
  readonly maturityDate: Date;
}

const worker = defineAutomationEndpoint({
  source: "event",
  messageType: "LoansPendingRiskAssess",
  handlerName: "AssessLoanRisk",
  createAdapter: createAssessLoanRiskAdapter,
  mapPayloadToCommand: async (payload: LoansPendingRiskAssessPayload) => {
    const enriched = await enrich(payload);
    return {
    commandType: "AssessLoanRisk" as const,
    portfolioId: payload.portfolioId,
    acquisitionDate: enriched.acquisitionDate,
    borrowerName: payload.borrowerName,
    creditRating: payload.creditRating,
    expectedLoss: enriched.expectedLoss,
    interestRate: payload.interestRate,
    loanAmount: payload.loanAmount,
    loanId: payload.loanId,
    maturityDate: payload.maturityDate,
    probabilityOfDefault: enriched.probabilityOfDefault,
    capitalRequirement: enriched.capitalRequirement,
    riskBand: enriched.riskBand,
    expectedPortfolioLoss: enriched.expectedPortfolioLoss,
    riskNarrative: enriched.riskNarrative,
    simulatedDefaultRate: enriched.simulatedDefaultRate,
    tailRiskLoss: enriched.tailRiskLoss,
    worstCaseLoss: enriched.worstCaseLoss,
    };
  },
});

export const endpointIdentity = worker.endpointIdentity;
export const createLoansPendingRiskAssessWorker = worker.create;
