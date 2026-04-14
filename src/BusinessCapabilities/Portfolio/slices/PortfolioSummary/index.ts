import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

type PortfolioSummaryPayload = {
  portfolioId: string;
  averageProbabilityOfDefault: number;
  averageRating: string;
  averageRiskWeight: number;
  riskBand: string;
  totalCapitalRequirement: number;
  totalExpectedLoss: number;
  totalExposure: number;
  totalLoans: number;
  worstRating: string;
  acquisitionDate: Date;
  borrowerName: string;
  capitalRequirement: number;
  creditRating: string;
  expectedLoss: number;
  expectedPortfolioLoss: number;
  interestRate: number;
  loanAmount: number;
  loanId: string;
  maturityDate: Date;
  probabilityOfDefault: number;
  riskNarrative: string;
  simulatedDefaultRate: number;
  tailRiskLoss: number;
  worstCaseLoss: number;
};

export const portfolioSummarySlice: ProjectionConfig = {
  projectionName: "PortfolioSummary",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanRiskAssessed: (payload, { projectionName }) => {
      const p = payload as PortfolioSummaryPayload;
      const key = p.portfolioId;
      const stored = {
        portfolioId: p.portfolioId,
        // portfolio-level aggregates (pre-computed in enrichment)
        totalLoans: p.totalLoans,
        totalExposure: p.totalExposure,
        totalCapitalRequirement: p.totalCapitalRequirement,
        totalExpectedLoss: p.totalExpectedLoss,
        averageProbabilityOfDefault: p.averageProbabilityOfDefault,
        averageRiskWeight: p.averageRiskWeight,
        averageRating: p.averageRating,
        riskBand: p.riskBand,
        worstRating: p.worstRating,
        // latest loan details (overwrite with most recent)
        loanId: p.loanId,
        borrowerName: p.borrowerName,
        loanAmount: p.loanAmount,
        capitalRequirement: p.capitalRequirement,
        expectedLoss: p.expectedLoss,
        creditRating: p.creditRating,
        probabilityOfDefault: p.probabilityOfDefault,
        acquisitionDate: p.acquisitionDate,
        maturityDate: p.maturityDate,
        interestRate: p.interestRate,
        riskNarrative: p.riskNarrative,
        expectedPortfolioLoss: p.expectedPortfolioLoss,
        simulatedDefaultRate: p.simulatedDefaultRate,
        tailRiskLoss: p.tailRiskLoss,
        worstCaseLoss: p.worstCaseLoss,
      };
      return [
        {
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (name, key) DO UPDATE
              SET payload = EXCLUDED.payload`,
          params: [projectionName, key, JSON.stringify(stored)],
        },
      ];
    },

  },
};
