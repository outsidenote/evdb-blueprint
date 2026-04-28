import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

type LoanRiskAssessedPayload = {
  portfolioId: string;
  loanAmount: number;
  capitalRequirement: number;
  expectedLoss: number;
  probabilityOfDefault: number;
  creditRating: string;
};

/**
 * Returns a SQL CASE expression that maps a credit rating column to its
 * Basel III standardised risk weight.
 * AAA→0.20, AA→0.25, A→0.35, BBB→0.50, BB→0.75, B→1.00, CCC→1.50
 */
const ratingWeight = (col: string): string =>
  `CASE ${col}
      WHEN 'AAA' THEN 0.20 WHEN 'AA'  THEN 0.25 WHEN 'A'   THEN 0.35
      WHEN 'BBB' THEN 0.50 WHEN 'BB'  THEN 0.75 WHEN 'B'   THEN 1.00
      WHEN 'CCC' THEN 1.50 ELSE 0 END`;

export const portfolioSummarySlice: ProjectionConfig = {
  projectionName: "PortfolioSummary",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanRiskAssessed: (payload, { projectionName }) => {
      const p = payload as LoanRiskAssessedPayload;
      const key = p.portfolioId;
      return [
        {
          sql: `
            WITH
              incoming AS (
                SELECT
                  $3::numeric AS loan_amount,
                  $4::numeric AS cap_req,
                  $5::numeric AS exp_loss,
                  $6::numeric AS pd,
                  $7::text    AS credit_rating,
                  $8::text    AS portfolio_id
              ),
              existing AS (
                SELECT payload
                FROM   projections
                WHERE  name = $1 AND key = $2
              ),
              computed AS (
                SELECT
                  i.portfolio_id,
                  COALESCE((e.payload->>'totalLoans')::int, 0) + 1
                    AS total_loans,
                  COALESCE((e.payload->>'totalExposure')::numeric, 0) + i.loan_amount
                    AS total_exposure,
                  COALESCE((e.payload->>'totalCapitalRequirement')::numeric, 0) + i.cap_req
                    AS total_cap_req,
                  COALESCE((e.payload->>'totalExpectedLoss')::numeric, 0) + i.exp_loss
                    AS total_exp_loss,
                  CASE
                    WHEN COALESCE((e.payload->>'totalExposure')::numeric, 0) = 0
                    THEN i.pd
                    ELSE (
                      (e.payload->>'averageProbabilityOfDefault')::numeric
                        * (e.payload->>'totalExposure')::numeric
                      + i.pd * i.loan_amount
                    ) / ((e.payload->>'totalExposure')::numeric + i.loan_amount)
                  END AS avg_pd,
                  -- averageRiskWeight = totalCapReq / (0.08 * totalExposure)
                  -- because capitalRequirement = loanAmount * riskWeight * 0.08
                  (COALESCE((e.payload->>'totalCapitalRequirement')::numeric, 0) + i.cap_req)
                  / (0.08 * (COALESCE((e.payload->>'totalExposure')::numeric, 0) + i.loan_amount))
                    AS avg_rw,
                  -- worstRating: keep whichever credit rating has the higher risk weight
                  CASE
                    WHEN e.payload IS NULL
                    THEN i.credit_rating
                    WHEN (${ratingWeight('i.credit_rating')})
                       > (${ratingWeight("(e.payload->>'worstRating')")})
                    THEN i.credit_rating
                    ELSE (e.payload->>'worstRating')
                  END AS worst_rating
                FROM incoming i
                LEFT JOIN existing e ON true
              )
            INSERT INTO projections (name, key, payload)
            SELECT $1, $2, jsonb_build_object(
              'portfolioId',                 c.portfolio_id,
              'totalLoans',                  c.total_loans,
              'totalExposure',               c.total_exposure,
              'totalCapitalRequirement',     c.total_cap_req,
              'totalExpectedLoss',           c.total_exp_loss,
              'averageProbabilityOfDefault', c.avg_pd,
              'averageRiskWeight',           c.avg_rw,
              'averageRating', CASE
                WHEN c.avg_rw <= 0.25 THEN 'AA'
                WHEN c.avg_rw <= 0.35 THEN 'A'
                WHEN c.avg_rw <= 0.50 THEN 'BBB'
                WHEN c.avg_rw <= 0.75 THEN 'BB'
                ELSE 'B' END,
              'riskBand', CASE
                WHEN c.avg_rw <= 0.55 THEN 'Investment Grade'
                ELSE 'Speculative' END,
              'worstRating', c.worst_rating
            )
            FROM computed c
            ON CONFLICT (name, key) DO UPDATE
              SET payload = EXCLUDED.payload`,
          params: [
            projectionName,
            key,
            p.loanAmount,
            p.capitalRequirement,
            p.expectedLoss,
            p.probabilityOfDefault,
            p.creditRating,
            p.portfolioId,
          ],
        },
      ];
    },
  },
};
