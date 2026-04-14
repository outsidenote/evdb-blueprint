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
              'portfolioId', $3::text,
              'totalLoans', 1,
              'totalExposure', $4::numeric,
              'totalCapitalRequirement', $5::numeric,
              'totalExpectedLoss', $6::numeric,
              'averageRiskWeight', $7::numeric,
              'averageProbabilityOfDefault', $8::numeric,
              'averageRating', CASE
                WHEN $7::numeric <= 0.25 THEN 'AA'
                WHEN $7::numeric <= 0.35 THEN 'A'
                WHEN $7::numeric <= 0.50 THEN 'BBB'
                WHEN $7::numeric <= 0.75 THEN 'BB'
                ELSE 'B'
              END,
              'riskBand', CASE
                WHEN $7::numeric <= 0.55 THEN 'Investment Grade'
                ELSE 'Speculative'
              END,
              'worstRating', CASE
                WHEN $7::numeric <= 0.25 THEN 'AA'
                WHEN $7::numeric <= 0.35 THEN 'A'
                WHEN $7::numeric <= 0.50 THEN 'BBB'
                WHEN $7::numeric <= 0.75 THEN 'BB'
                ELSE 'B'
              END
            ))
            ON CONFLICT (name, key) DO UPDATE
              SET payload = jsonb_build_object(
                'portfolioId', $3::text,
                'totalLoans', (projections.payload->>'totalLoans')::int + 1,
                'totalExposure', (projections.payload->>'totalExposure')::numeric + $4::numeric,
                'totalCapitalRequirement', (projections.payload->>'totalCapitalRequirement')::numeric + $5::numeric,
                'totalExpectedLoss', (projections.payload->>'totalExpectedLoss')::numeric + $6::numeric,
                'averageRiskWeight', (
                  (projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageRiskWeight')::numeric
                  + $4::numeric * $7::numeric
                ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric),
                'averageProbabilityOfDefault', (
                  (projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageProbabilityOfDefault')::numeric
                  + $4::numeric * $8::numeric
                ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric),
                'averageRating', CASE
                  WHEN (
                    (projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageRiskWeight')::numeric
                    + $4::numeric * $7::numeric
                  ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.25 THEN 'AA'
                  WHEN (
                    (projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageRiskWeight')::numeric
                    + $4::numeric * $7::numeric
                  ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.35 THEN 'A'
                  WHEN (
                    (projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageRiskWeight')::numeric
                    + $4::numeric * $7::numeric
                  ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.50 THEN 'BBB'
                  WHEN (
                    (projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageRiskWeight')::numeric
                    + $4::numeric * $7::numeric
                  ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.75 THEN 'BB'
                  ELSE 'B'
                END,
                'riskBand', CASE
                  WHEN (
                    (projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageRiskWeight')::numeric
                    + $4::numeric * $7::numeric
                  ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.55 THEN 'Investment Grade'
                  ELSE 'Speculative'
                END,
                'worstRating', CASE
                  WHEN $7::numeric > CASE
                    WHEN projections.payload->>'worstRating' = 'AA' THEN 0.25
                    WHEN projections.payload->>'worstRating' = 'A' THEN 0.35
                    WHEN projections.payload->>'worstRating' = 'BBB' THEN 0.50
                    WHEN projections.payload->>'worstRating' = 'BB' THEN 0.75
                    ELSE 9999999
                  END
                  THEN CASE
                    WHEN $7::numeric <= 0.25 THEN 'AA'
                    WHEN $7::numeric <= 0.35 THEN 'A'
                    WHEN $7::numeric <= 0.50 THEN 'BBB'
                    WHEN $7::numeric <= 0.75 THEN 'BB'
                    ELSE 'B'
                  END
                  ELSE projections.payload->>'worstRating'
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
          ],
        },
      ];
    },

  },
};
