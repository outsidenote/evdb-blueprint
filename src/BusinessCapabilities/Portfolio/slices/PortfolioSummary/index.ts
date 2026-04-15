import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

type LoanRiskAssessedEventPayload = {
  portfolioId: string;
  loanAmount: number;
  riskWeight: number;
  probabilityOfDefault: number;
  capitalRequirement: number;
  expectedLoss: number;
};

export const portfolioSummarySlice: ProjectionConfig = {
  projectionName: "PortfolioSummary",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanRiskAssessed: (payload, { projectionName }) => {
      const p = payload as LoanRiskAssessedEventPayload;
      const key = p.portfolioId;
      return [
        {
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, jsonb_build_object(
              'portfolioId', $3::text,
              'totalLoans', 1,
              'totalExposure', $4::numeric,
              'totalCapitalRequirement', $7::numeric,
              'totalExpectedLoss', $8::numeric,
              'averageRiskWeight', $5::numeric,
              'averageProbabilityOfDefault', $6::numeric,
              'averageRating', CASE
                WHEN $5::numeric <= 0.25 THEN 'AA'::text
                WHEN $5::numeric <= 0.35 THEN 'A'::text
                WHEN $5::numeric <= 0.50 THEN 'BBB'::text
                WHEN $5::numeric <= 0.75 THEN 'BB'::text
                ELSE 'B'::text
              END,
              'riskBand', CASE
                WHEN $5::numeric <= 0.55 THEN 'Investment Grade'::text
                ELSE 'Speculative'::text
              END,
              'worstRating', CASE
                WHEN $5::numeric <= 0.25 THEN 'AA'::text
                WHEN $5::numeric <= 0.35 THEN 'A'::text
                WHEN $5::numeric <= 0.50 THEN 'BBB'::text
                WHEN $5::numeric <= 0.75 THEN 'BB'::text
                ELSE 'B'::text
              END,
              'worstRiskWeight', $5::numeric
            ))
            ON CONFLICT (name, key) DO UPDATE
              SET payload = jsonb_build_object(
                'portfolioId', $3::text,
                'totalLoans', (projections.payload->>'totalLoans')::int + 1,
                'totalExposure', (projections.payload->>'totalExposure')::numeric + $4::numeric,
                'totalCapitalRequirement', (projections.payload->>'totalCapitalRequirement')::numeric + $7::numeric,
                'totalExpectedLoss', (projections.payload->>'totalExpectedLoss')::numeric + $8::numeric,
                'averageRiskWeight', (
                  (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric + $5::numeric * $4::numeric
                ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric),
                'averageProbabilityOfDefault', (
                  (projections.payload->>'averageProbabilityOfDefault')::numeric * (projections.payload->>'totalExposure')::numeric + $6::numeric * $4::numeric
                ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric),
                'averageRating', CASE
                  WHEN ((projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric + $5::numeric * $4::numeric) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.25 THEN 'AA'::text
                  WHEN ((projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric + $5::numeric * $4::numeric) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.35 THEN 'A'::text
                  WHEN ((projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric + $5::numeric * $4::numeric) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.50 THEN 'BBB'::text
                  WHEN ((projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric + $5::numeric * $4::numeric) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.75 THEN 'BB'::text
                  ELSE 'B'::text
                END,
                'riskBand', CASE
                  WHEN ((projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric + $5::numeric * $4::numeric) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.55 THEN 'Investment Grade'::text
                  ELSE 'Speculative'::text
                END,
                'worstRating', CASE
                  WHEN $5::numeric > (projections.payload->>'worstRiskWeight')::numeric THEN
                    CASE
                      WHEN $5::numeric <= 0.25 THEN 'AA'::text
                      WHEN $5::numeric <= 0.35 THEN 'A'::text
                      WHEN $5::numeric <= 0.50 THEN 'BBB'::text
                      WHEN $5::numeric <= 0.75 THEN 'BB'::text
                      ELSE 'B'::text
                    END
                  ELSE (projections.payload->>'worstRating')::text
                END,
                'worstRiskWeight', GREATEST((projections.payload->>'worstRiskWeight')::numeric, $5::numeric)
              )`,
          params: [
            projectionName,
            key,
            p.portfolioId,
            p.loanAmount,
            p.riskWeight,
            p.probabilityOfDefault,
            p.capitalRequirement,
            p.expectedLoss,
          ],
        },
      ];
    },
  },
};
