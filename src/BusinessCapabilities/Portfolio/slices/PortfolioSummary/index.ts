import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

type LoanRiskAssessedPayload = {
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
      const p = payload as LoanRiskAssessedPayload;
      const key = p.portfolioId;
      return [
        {
          // Statement 1: UPSERT accumulating numeric fields; derived string fields updated in statement 2
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, jsonb_build_object(
              'portfolioId', $3,
              'totalLoans', 1,
              'totalExposure', $4::numeric,
              'totalCapitalRequirement', $5::numeric,
              'totalExpectedLoss', $6::numeric,
              'averageRiskWeight', $7::numeric,
              'averageProbabilityOfDefault', $8::numeric,
              'worstRiskWeight', $7::numeric,
              'averageRating', '',
              'riskBand', '',
              'worstRating', ''
            ))
            ON CONFLICT (name, key) DO UPDATE
              SET payload = jsonb_build_object(
                'portfolioId', $3,
                'totalLoans', (projections.payload->>'totalLoans')::int + 1,
                'totalExposure', (projections.payload->>'totalExposure')::numeric + $4::numeric,
                'totalCapitalRequirement', (projections.payload->>'totalCapitalRequirement')::numeric + $5::numeric,
                'totalExpectedLoss', (projections.payload->>'totalExpectedLoss')::numeric + $6::numeric,
                'averageRiskWeight',
                  ((projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                    + $7::numeric * $4::numeric)
                  / NULLIF((projections.payload->>'totalExposure')::numeric + $4::numeric, 0),
                'averageProbabilityOfDefault',
                  ((projections.payload->>'averageProbabilityOfDefault')::numeric * (projections.payload->>'totalExposure')::numeric
                    + $8::numeric * $4::numeric)
                  / NULLIF((projections.payload->>'totalExposure')::numeric + $4::numeric, 0),
                'worstRiskWeight', GREATEST((projections.payload->>'worstRiskWeight')::numeric, $7::numeric),
                'averageRating', '',
                'riskBand', '',
                'worstRating', ''
              )`,
          params: [projectionName, key, p.portfolioId, p.loanAmount, p.capitalRequirement, p.expectedLoss, p.riskWeight, p.probabilityOfDefault],
        },
        {
          // Statement 2: compute derived string fields from stored numeric values
          sql: `
            UPDATE projections
            SET payload = jsonb_set(
              jsonb_set(
                jsonb_set(payload, '{averageRating}', to_jsonb(
                  CASE
                    WHEN (payload->>'averageRiskWeight')::numeric <= 0.25 THEN 'AA'
                    WHEN (payload->>'averageRiskWeight')::numeric <= 0.35 THEN 'A'
                    WHEN (payload->>'averageRiskWeight')::numeric <= 0.50 THEN 'BBB'
                    WHEN (payload->>'averageRiskWeight')::numeric <= 0.75 THEN 'BB'
                    ELSE 'B'
                  END
                )),
                '{riskBand}', to_jsonb(
                  CASE WHEN (payload->>'averageRiskWeight')::numeric <= 0.55 THEN 'Investment Grade' ELSE 'Speculative' END
                )
              ),
              '{worstRating}', to_jsonb(
                CASE
                  WHEN (payload->>'worstRiskWeight')::numeric <= 0.25 THEN 'AA'
                  WHEN (payload->>'worstRiskWeight')::numeric <= 0.35 THEN 'A'
                  WHEN (payload->>'worstRiskWeight')::numeric <= 0.50 THEN 'BBB'
                  WHEN (payload->>'worstRiskWeight')::numeric <= 0.75 THEN 'BB'
                  ELSE 'B'
                END
              )
            )
            WHERE name = $1 AND key = $2`,
          params: [projectionName, key],
        },
      ];
    },
  },
};
