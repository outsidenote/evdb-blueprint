import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

type PortfolioLoanDetailsPayload = {
  portfolioId: string;
  loanId: string;
  acquisitionDate: Date;
  borrowerName: string;
  capitalRequirement: number;
  creditRating: string;
  expectedLoss: number;
  interestRate: number;
  loanAmount: number;
  maturityDate: Date;
  probabilityOfDefault: number;
  riskBand: string;
  expectedPortfolioLoss: number;
  riskNarrative: string;
  simulatedDefaultRate: number;
  tailRiskLoss: number;
  worstCaseLoss: number;
};

export const portfolioLoanDetailsSlice: ProjectionConfig = {
  projectionName: "PortfolioLoanDetails",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanRiskAssessed: (payload, { projectionName }) => {
      const p = payload as PortfolioLoanDetailsPayload;
      const key = `${p.portfolioId}:${p.loanId}`;
      return [
        {
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (name, key) DO UPDATE
              SET payload = EXCLUDED.payload`,
          params: [
            projectionName,
            key,
            JSON.stringify(p),
          ],
        },
      ];
    },

  },
};
