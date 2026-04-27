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
      // params: $1=projectionName, $2=key/portfolioId, $3=loanAmount,
      //         $4=capitalRequirement, $5=expectedLoss, $6=riskWeight, $7=probabilityOfDefault
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
              'weightedRiskWeightSum', $6::numeric * $3::numeric,
              'weightedPodSum', $7::numeric * $3::numeric,
              'averageRiskWeight', $6::numeric,
              'averageProbabilityOfDefault', $7::numeric,
              'averageRating', CASE
                WHEN $6::numeric <= 0.25 THEN 'AA'
                WHEN $6::numeric <= 0.35 THEN 'A'
                WHEN $6::numeric <= 0.50 THEN 'BBB'
                WHEN $6::numeric <= 0.75 THEN 'BB'
                ELSE 'B'
              END,
              'riskBand', CASE WHEN $6::numeric <= 0.55 THEN 'Investment Grade' ELSE 'Speculative' END,
              'worstRiskWeight', $6::numeric,
              'worstRating', CASE
                WHEN $6::numeric <= 0.25 THEN 'AA'
                WHEN $6::numeric <= 0.35 THEN 'A'
                WHEN $6::numeric <= 0.50 THEN 'BBB'
                WHEN $6::numeric <= 0.75 THEN 'BB'
                ELSE 'B'
              END
            ))
            ON CONFLICT (name, key) DO UPDATE
              SET payload = jsonb_build_object(
                'portfolioId', $2::varchar,
                'totalLoans', (projections.payload->>'totalLoans')::int + 1,
                'totalExposure', (projections.payload->>'totalExposure')::numeric + $3::numeric,
                'totalCapitalRequirement', (projections.payload->>'totalCapitalRequirement')::numeric + $4::numeric,
                'totalExpectedLoss', (projections.payload->>'totalExpectedLoss')::numeric + $5::numeric,
                'weightedRiskWeightSum', (projections.payload->>'weightedRiskWeightSum')::numeric + $6::numeric * $3::numeric,
                'weightedPodSum', (projections.payload->>'weightedPodSum')::numeric + $7::numeric * $3::numeric,
                'averageRiskWeight',
                  ((projections.payload->>'weightedRiskWeightSum')::numeric + $6::numeric * $3::numeric)
                  / ((projections.payload->>'totalExposure')::numeric + $3::numeric),
                'averageProbabilityOfDefault',
                  ((projections.payload->>'weightedPodSum')::numeric + $7::numeric * $3::numeric)
                  / ((projections.payload->>'totalExposure')::numeric + $3::numeric),
                'averageRating', CASE
                  WHEN ((projections.payload->>'weightedRiskWeightSum')::numeric + $6::numeric * $3::numeric)
                       / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.25 THEN 'AA'
                  WHEN ((projections.payload->>'weightedRiskWeightSum')::numeric + $6::numeric * $3::numeric)
                       / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.35 THEN 'A'
                  WHEN ((projections.payload->>'weightedRiskWeightSum')::numeric + $6::numeric * $3::numeric)
                       / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.50 THEN 'BBB'
                  WHEN ((projections.payload->>'weightedRiskWeightSum')::numeric + $6::numeric * $3::numeric)
                       / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.75 THEN 'BB'
                  ELSE 'B'
                END,
                'riskBand', CASE
                  WHEN ((projections.payload->>'weightedRiskWeightSum')::numeric + $6::numeric * $3::numeric)
                       / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.55
                  THEN 'Investment Grade'
                  ELSE 'Speculative'
                END,
                'worstRiskWeight', GREATEST($6::numeric, (projections.payload->>'worstRiskWeight')::numeric),
                'worstRating', CASE
                  WHEN GREATEST($6::numeric, (projections.payload->>'worstRiskWeight')::numeric) <= 0.25 THEN 'AA'
                  WHEN GREATEST($6::numeric, (projections.payload->>'worstRiskWeight')::numeric) <= 0.35 THEN 'A'
                  WHEN GREATEST($6::numeric, (projections.payload->>'worstRiskWeight')::numeric) <= 0.50 THEN 'BBB'
                  WHEN GREATEST($6::numeric, (projections.payload->>'worstRiskWeight')::numeric) <= 0.75 THEN 'BB'
                  ELSE 'B'
                END
              )`,
          params: [
            projectionName,
            key,
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
