import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

type LoanRiskAssessedPayload = {
  portfolioId: string;
  loanAmount: number;
  capitalRequirement: number;
  expectedLoss: number;
  probabilityOfDefault: number;
  riskWeight: number;
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
              'totalLoans', 1::int,
              'totalExposure', $4::numeric,
              'totalCapitalRequirement', $5::numeric,
              'totalExpectedLoss', $6::numeric,
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
              'worstRating', CASE
                WHEN $7::numeric <= 0.25 THEN 'AA'::text
                WHEN $7::numeric <= 0.35 THEN 'A'::text
                WHEN $7::numeric <= 0.50 THEN 'BBB'::text
                WHEN $7::numeric <= 0.75 THEN 'BB'::text
                ELSE 'B'::text
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
                  (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                  + $7::numeric * $4::numeric
                ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric),
                'averageProbabilityOfDefault', (
                  (projections.payload->>'averageProbabilityOfDefault')::numeric * (projections.payload->>'totalExposure')::numeric
                  + $8::numeric * $4::numeric
                ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric),
                'averageRating', CASE
                  WHEN (
                    (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                    + $7::numeric * $4::numeric
                  ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.25 THEN 'AA'::text
                  WHEN (
                    (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                    + $7::numeric * $4::numeric
                  ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.35 THEN 'A'::text
                  WHEN (
                    (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                    + $7::numeric * $4::numeric
                  ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.50 THEN 'BBB'::text
                  WHEN (
                    (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                    + $7::numeric * $4::numeric
                  ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.75 THEN 'BB'::text
                  ELSE 'B'::text
                END,
                'riskBand', CASE
                  WHEN (
                    (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                    + $7::numeric * $4::numeric
                  ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.55 THEN 'Investment Grade'::text
                  ELSE 'Speculative'::text
                END,
                'worstRating', CASE
                  WHEN $7::numeric > CASE (projections.payload->>'worstRating')
                    WHEN 'AA' THEN 0.25
                    WHEN 'A' THEN 0.35
                    WHEN 'BBB' THEN 0.50
                    WHEN 'BB' THEN 0.75
                    ELSE 1.0
                  END
                  THEN CASE
                    WHEN $7::numeric <= 0.25 THEN 'AA'::text
                    WHEN $7::numeric <= 0.35 THEN 'A'::text
                    WHEN $7::numeric <= 0.50 THEN 'BBB'::text
                    WHEN $7::numeric <= 0.75 THEN 'BB'::text
                    ELSE 'B'::text
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
