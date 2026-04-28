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
            VALUES ($1, $2, jsonb_build_object(
              'portfolioId', $3::text,
              'loanId', $4::text,
              'acquisitionDate', $5::text,
              'borrowerName', $6::text,
              'capitalRequirement', $7::text,
              'creditRating', $8::text,
              'expectedLoss', $9::text,
              'interestRate', $10::text,
              'loanAmount', $11::text,
              'maturityDate', $12::date,
              'probabilityOfDefault', $13::text,
              'riskBand', $14::text,
              'expectedPortfolioLoss', $15::text,
              'riskNarrative', $16::text,
              'simulatedDefaultRate', $17::text,
              'tailRiskLoss', $18::text,
              'worstCaseLoss', $19::text
            ))
            ON CONFLICT (name, key) DO UPDATE
              SET payload = jsonb_build_object(
                'portfolioId', $3::text,
                'loanId', $4::text,
                'acquisitionDate', $5::text,
                'borrowerName', $6::text,
                'capitalRequirement', $7::text,
                'creditRating', $8::text,
                'expectedLoss', $9::text,
                'interestRate', $10::text,
                'loanAmount', $11::text,
                'maturityDate', $12::date,
                'probabilityOfDefault', $13::text,
                'riskBand', $14::text,
                'expectedPortfolioLoss', $15::text,
                'riskNarrative', $16::text,
                'simulatedDefaultRate', $17::text,
                'tailRiskLoss', $18::text,
                'worstCaseLoss', $19::text
              )`,
          params: [
            projectionName,
            key,
            p.portfolioId,
            p.loanId,
            p.acquisitionDate instanceof Date ? p.acquisitionDate.toISOString() : p.acquisitionDate,
            p.borrowerName,
            p.capitalRequirement,
            p.creditRating,
            p.expectedLoss,
            p.interestRate,
            p.loanAmount,
            p.maturityDate instanceof Date ? p.maturityDate.toISOString() : p.maturityDate,
            p.probabilityOfDefault,
            p.riskBand,
            p.expectedPortfolioLoss,
            p.riskNarrative,
            p.simulatedDefaultRate,
            p.tailRiskLoss,
            p.worstCaseLoss,
          ],
        },
      ];
    },
  },
};
