import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

type LoanAddedToPortfolioPayload = {
  portfolioId: string;
  borrowerName: string;
  creditRating: string;
  interestRate: number;
  loanAmount: number;
  loanId: string;
  maturityDate: Date;
};

type LoanRejectedFromPortfolioPayload = {
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
      const p = payload as LoanAddedToPortfolioPayload;
      const key = p.portfolioId;
      const maturityDate = p.maturityDate instanceof Date ? p.maturityDate.toISOString() : p.maturityDate;
      return [
        {
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, jsonb_build_object(
              'borrowerName', $3::text,
              'creditRating', $4::text,
              'interestRate', $5::numeric,
              'loanAmount', $6::numeric,
              'loanId', $7::text,
              'maturityDate', $8::text,
              'errorMessage', $9::text
            ))
            ON CONFLICT (name, key) DO UPDATE
              SET payload = jsonb_build_object(
                'borrowerName', $3::text,
                'creditRating', $4::text,
                'interestRate', $5::numeric,
                'loanAmount', $6::numeric,
                'loanId', $7::text,
                'maturityDate', $8::text,
                'errorMessage', $9::text
              )`,
          params: [
            projectionName,
            key,
            p.borrowerName,
            p.creditRating,
            p.interestRate,
            p.loanAmount,
            p.loanId,
            maturityDate,
            "", // no error for a successfully added loan
          ],
        },
      ];
    },

    LoanRejectedFromPortfolio: (payload, { projectionName }) => {
      const p = payload as LoanRejectedFromPortfolioPayload;
      const key = p.portfolioId;
      const maturityDate = p.maturityDate instanceof Date ? p.maturityDate.toISOString() : p.maturityDate;
      return [
        {
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, jsonb_build_object(
              'borrowerName', $3::text,
              'creditRating', $4::text,
              'interestRate', $5::numeric,
              'loanAmount', $6::numeric,
              'loanId', $7::text,
              'maturityDate', $8::text,
              'errorMessage', $9::text
            ))
            ON CONFLICT (name, key) DO UPDATE
              SET payload = jsonb_build_object(
                'borrowerName', $3::text,
                'creditRating', $4::text,
                'interestRate', $5::numeric,
                'loanAmount', $6::numeric,
                'loanId', $7::text,
                'maturityDate', $8::text,
                'errorMessage', $9::text
              )`,
          params: [
            projectionName,
            key,
            p.borrowerName,
            p.creditRating,
            p.interestRate,
            p.loanAmount,
            p.loanId,
            maturityDate,
            p.errorMessage,
          ],
        },
      ];
    },
  },
};
