import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

type LoanRiskAssessedEnrichedPayload = {
  portfolioId: string;
  loanAmount: number;
  capitalRequirement: number;
  expectedLoss: number;
  riskWeight: number;
  probabilityOfDefault: number;
  creditRating: string;
};

export const portfolioSummarySlice: ProjectionConfig = {
  projectionName: "PortfolioSummary",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanRiskAssessed: (payload, { projectionName }) => {
      const p = payload as LoanRiskAssessedEnrichedPayload;
      const key = p.portfolioId;
      return [
        {
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, jsonb_build_object(
              'portfolioId', $3::text,
              'totalLoans', 1,
              'totalExposure', $4::numeric,
              'totalCapitalRequirement', $5::numeric,
              'totalExpectedLoss', $6::numeric,
              'weightedRiskWeightSum', $7::numeric * $4::numeric,
              'weightedPodSum', $8::numeric * $4::numeric,
              'averageRiskWeight', $7::numeric,
              'averageProbabilityOfDefault', $8::numeric,
              'averageRating', CASE
                WHEN $7::numeric <= 0.25 THEN 'AA'::text
                WHEN $7::numeric <= 0.35 THEN 'A'::text
                WHEN $7::numeric <= 0.50 THEN 'BBB'::text
                WHEN $7::numeric <= 0.75 THEN 'BB'::text
                ELSE 'B'::text
              END,
              'riskBand', CASE
                WHEN $7::numeric <= 0.55 THEN 'Investment Grade'::text
                ELSE 'Speculative'::text
              END,
              'worstRating', $9::text,
              'worstRiskWeight', $7::numeric
            ))
            ON CONFLICT (name, key) DO UPDATE
              SET payload = jsonb_build_object(
                'portfolioId', $3::text,
                'totalLoans', (projections.payload->>'totalLoans')::int + 1,
                'totalExposure', (projections.payload->>'totalExposure')::numeric + $4::numeric,
                'totalCapitalRequirement', (projections.payload->>'totalCapitalRequirement')::numeric + $5::numeric,
                'totalExpectedLoss', (projections.payload->>'totalExpectedLoss')::numeric + $6::numeric,
                'weightedRiskWeightSum', (projections.payload->>'weightedRiskWeightSum')::numeric + $7::numeric * $4::numeric,
                'weightedPodSum', (projections.payload->>'weightedPodSum')::numeric + $8::numeric * $4::numeric,
                'averageRiskWeight',
                  ((projections.payload->>'weightedRiskWeightSum')::numeric + $7::numeric * $4::numeric)
                  / ((projections.payload->>'totalExposure')::numeric + $4::numeric),
                'averageProbabilityOfDefault',
                  ((projections.payload->>'weightedPodSum')::numeric + $8::numeric * $4::numeric)
                  / ((projections.payload->>'totalExposure')::numeric + $4::numeric),
                'averageRating', CASE
                  WHEN ((projections.payload->>'weightedRiskWeightSum')::numeric + $7::numeric * $4::numeric)
                       / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.25 THEN 'AA'::text
                  WHEN ((projections.payload->>'weightedRiskWeightSum')::numeric + $7::numeric * $4::numeric)
                       / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.35 THEN 'A'::text
                  WHEN ((projections.payload->>'weightedRiskWeightSum')::numeric + $7::numeric * $4::numeric)
                       / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.50 THEN 'BBB'::text
                  WHEN ((projections.payload->>'weightedRiskWeightSum')::numeric + $7::numeric * $4::numeric)
                       / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.75 THEN 'BB'::text
                  ELSE 'B'::text
                END,
                'riskBand', CASE
                  WHEN ((projections.payload->>'weightedRiskWeightSum')::numeric + $7::numeric * $4::numeric)
                       / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.55 THEN 'Investment Grade'::text
                  ELSE 'Speculative'::text
                END,
                'worstRating', CASE
                  WHEN $7::numeric > (projections.payload->>'worstRiskWeight')::numeric THEN $9::text
                  ELSE (projections.payload->>'worstRating')::text
                END,
                'worstRiskWeight', CASE
                  WHEN $7::numeric > (projections.payload->>'worstRiskWeight')::numeric THEN $7::numeric
                  ELSE (projections.payload->>'worstRiskWeight')::numeric
                END
              )`,
          params: [
            projectionName,
            key,
            p.portfolioId,
            p.loanAmount,
            p.capitalRequirement,
            p.expectedLoss,
            p.riskWeight,
            p.probabilityOfDefault,
            p.creditRating,
          ],
        },
      ];
    },
  },
};
