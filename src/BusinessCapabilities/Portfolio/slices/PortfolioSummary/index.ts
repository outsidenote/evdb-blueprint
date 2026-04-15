import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

type LoanRiskAssessedPayload = {
  portfolioId: string;
  loanAmount: number;
  capitalRequirement: number;
  expectedLoss: number;
  riskWeight: number;
  probabilityOfDefault: number;
};

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
              prev AS (SELECT payload FROM projections WHERE name = $1 AND key = $2),
              totals AS (
                SELECT
                  COALESCE((prev.payload->>'totalLoans')::int, 0) + 1 AS total_loans,
                  COALESCE((prev.payload->>'totalExposure')::numeric, 0) + $4::numeric AS total_exposure,
                  COALESCE((prev.payload->>'totalCapitalRequirement')::numeric, 0) + $5::numeric AS total_cap_req,
                  COALESCE((prev.payload->>'totalExpectedLoss')::numeric, 0) + $6::numeric AS total_exp_loss,
                  COALESCE((prev.payload->>'weightedRiskWeightSum')::numeric, 0) + ($7::numeric * $4::numeric) AS w_rw_sum,
                  COALESCE((prev.payload->>'weightedPdSum')::numeric, 0) + ($8::numeric * $4::numeric) AS w_pd_sum,
                  GREATEST(COALESCE((prev.payload->>'worstRiskWeight')::numeric, 0), $7::numeric) AS worst_rw
                FROM (SELECT NULL) dummy LEFT JOIN prev ON true
              )
            INSERT INTO projections (name, key, payload)
            SELECT
              $1, $2,
              jsonb_build_object(
                'portfolioId', $3::text,
                'totalLoans', t.total_loans,
                'totalExposure', t.total_exposure,
                'totalCapitalRequirement', t.total_cap_req,
                'totalExpectedLoss', t.total_exp_loss,
                'weightedRiskWeightSum', t.w_rw_sum,
                'weightedPdSum', t.w_pd_sum,
                'worstRiskWeight', t.worst_rw,
                'averageRiskWeight', t.w_rw_sum / t.total_exposure,
                'averageProbabilityOfDefault', t.w_pd_sum / t.total_exposure,
                'averageRating', CASE
                  WHEN t.w_rw_sum / t.total_exposure <= 0.25 THEN 'AA'
                  WHEN t.w_rw_sum / t.total_exposure <= 0.35 THEN 'A'
                  WHEN t.w_rw_sum / t.total_exposure <= 0.50 THEN 'BBB'
                  WHEN t.w_rw_sum / t.total_exposure <= 0.75 THEN 'BB'
                  ELSE 'B'
                END,
                'riskBand', CASE
                  WHEN t.w_rw_sum / t.total_exposure <= 0.55 THEN 'Investment Grade'
                  ELSE 'Speculative'
                END,
                'worstRating', CASE
                  WHEN t.worst_rw <= 0.25 THEN 'AA'
                  WHEN t.worst_rw <= 0.35 THEN 'A'
                  WHEN t.worst_rw <= 0.50 THEN 'BBB'
                  WHEN t.worst_rw <= 0.75 THEN 'BB'
                  ELSE 'B'
                END
              )
            FROM totals t
            ON CONFLICT (name, key) DO UPDATE
              SET payload = EXCLUDED.payload`,
          params: [
            projectionName,
            key,
            p.portfolioId,
            p.loanAmount,
            p.capitalRequirement,
            p.expectedLoss,
            p.riskWeight,
            p.probabilityOfDefault,
          ],
        },
      ];
    },
  },
};
