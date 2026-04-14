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
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, jsonb_build_object(
              'portfolioId', $2::varchar,
              'totalLoans', 1,
              'totalExposure', $3::numeric,
              'totalCapitalRequirement', $4::numeric,
              'totalExpectedLoss', $5::numeric,
              'totalRiskWeightedAmount', $6::numeric * $3::numeric,
              'totalPDWeightedAmount', $7::numeric * $3::numeric,
              'averageRiskWeight', $6::numeric,
              'averageProbabilityOfDefault', $7::numeric,
              'averageRating', CASE
                WHEN $6::numeric <= 0.25 THEN 'AA'
                WHEN $6::numeric <= 0.35 THEN 'A'
                WHEN $6::numeric <= 0.50 THEN 'BBB'
                WHEN $6::numeric <= 0.75 THEN 'BB'
                ELSE 'B' END,
              'riskBand', CASE
                WHEN $6::numeric <= 0.55 THEN 'Investment Grade'
                ELSE 'Speculative' END,
              'worstRiskWeight', $6::numeric,
              'worstRating', CASE
                WHEN $6::numeric <= 0.25 THEN 'AA'
                WHEN $6::numeric <= 0.35 THEN 'A'
                WHEN $6::numeric <= 0.50 THEN 'BBB'
                WHEN $6::numeric <= 0.75 THEN 'BB'
                ELSE 'B' END
            ))
            ON CONFLICT (name, key) DO UPDATE
              SET payload = jsonb_build_object(
                'portfolioId', $2::varchar,
                'totalLoans', (projections.payload->>'totalLoans')::int + 1,
                'totalExposure', (projections.payload->>'totalExposure')::numeric + $3::numeric,
                'totalCapitalRequirement', (projections.payload->>'totalCapitalRequirement')::numeric + $4::numeric,
                'totalExpectedLoss', (projections.payload->>'totalExpectedLoss')::numeric + $5::numeric,
                'totalRiskWeightedAmount', (projections.payload->>'totalRiskWeightedAmount')::numeric + $6::numeric * $3::numeric,
                'totalPDWeightedAmount', (projections.payload->>'totalPDWeightedAmount')::numeric + $7::numeric * $3::numeric,
                'averageRiskWeight', ((projections.payload->>'totalRiskWeightedAmount')::numeric + $6::numeric * $3::numeric) / ((projections.payload->>'totalExposure')::numeric + $3::numeric),
                'averageProbabilityOfDefault', ((projections.payload->>'totalPDWeightedAmount')::numeric + $7::numeric * $3::numeric) / ((projections.payload->>'totalExposure')::numeric + $3::numeric),
                'averageRating', CASE
                  WHEN ((projections.payload->>'totalRiskWeightedAmount')::numeric + $6::numeric * $3::numeric) / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.25 THEN 'AA'
                  WHEN ((projections.payload->>'totalRiskWeightedAmount')::numeric + $6::numeric * $3::numeric) / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.35 THEN 'A'
                  WHEN ((projections.payload->>'totalRiskWeightedAmount')::numeric + $6::numeric * $3::numeric) / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.50 THEN 'BBB'
                  WHEN ((projections.payload->>'totalRiskWeightedAmount')::numeric + $6::numeric * $3::numeric) / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.75 THEN 'BB'
                  ELSE 'B' END,
                'riskBand', CASE
                  WHEN ((projections.payload->>'totalRiskWeightedAmount')::numeric + $6::numeric * $3::numeric) / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.55 THEN 'Investment Grade'
                  ELSE 'Speculative' END,
                'worstRiskWeight', GREATEST((projections.payload->>'worstRiskWeight')::numeric, $6::numeric),
                'worstRating', CASE
                  WHEN GREATEST((projections.payload->>'worstRiskWeight')::numeric, $6::numeric) <= 0.25 THEN 'AA'
                  WHEN GREATEST((projections.payload->>'worstRiskWeight')::numeric, $6::numeric) <= 0.35 THEN 'A'
                  WHEN GREATEST((projections.payload->>'worstRiskWeight')::numeric, $6::numeric) <= 0.50 THEN 'BBB'
                  WHEN GREATEST((projections.payload->>'worstRiskWeight')::numeric, $6::numeric) <= 0.75 THEN 'BB'
                  ELSE 'B' END
              )`,
          params: [projectionName, key, p.loanAmount, p.capitalRequirement, p.expectedLoss, p.riskWeight, p.probabilityOfDefault],
        },
      ];
    },
  },
};
