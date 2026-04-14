import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

type LoansPendingRiskAssessPayload = {
  portfolioId: string;
  loanId: string;
  acquisitionDate: Date;
  borrowerName: string;
  creditRating: string;
  interestRate: number;
  loanAmount: number;
  maturityDate: Date;
};

export const readModelSlice: ProjectionConfig = {
  projectionName: "ReadModel",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanAddedToPortfolio: (payload, { projectionName }) => {
      const p = payload as LoansPendingRiskAssessPayload;
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
            JSON.stringify({
              portfolioId: p.portfolioId,
              loanId: p.loanId,
              acquisitionDate: p.acquisitionDate,
              borrowerName: p.borrowerName,
              creditRating: p.creditRating,
              interestRate: p.interestRate,
              loanAmount: p.loanAmount,
              maturityDate: p.maturityDate,
            }),
          ],
        },
      ];
    },
  },
};
