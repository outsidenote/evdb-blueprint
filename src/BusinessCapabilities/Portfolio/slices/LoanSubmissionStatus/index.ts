import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

type LoanSubmissionStatusPayload = {
  portfolioId: string;
  borrowerName: string;
  creditRating: string;
  interestRate: number;
  loanAmount: number;
  loanId: string;
  maturityDate: Date;
  errorMessage: string;
};

export const loanSubmissionStatusSlice: ProjectionConfig = {
  projectionName: "LoanSubmissionStatus",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanAddedToPortfolio: (payload, { projectionName }) => {
      const p = payload as LoanSubmissionStatusPayload;
      const key = p.portfolioId;
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
            JSON.stringify(p), // TODO: select specific fields to store
          ],
        },
      ];
    },

    LoanRejectedFromPortfolio: (payload, { projectionName }) => {
      const p = payload as LoanSubmissionStatusPayload;
      const key = p.portfolioId;
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
            JSON.stringify(p), // TODO: select specific fields to store
          ],
        },
      ];
    },

  },
};
