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
      const weightedRiskWeight = p.riskWeight * p.loanAmount;
      const weightedPD = p.probabilityOfDefault * p.loanAmount;
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
              'sumWeightedRiskWeight', $9::numeric,
              'sumWeightedPD', $10::numeric,
              'averageRiskWeight', $7::numeric,
              'averageProbabilityOfDefault', $8::numeric,
              'averageRating', CASE
                WHEN $7::numeric <= 0.25 THEN 'AA'::text
                WHEN $7::numeric <= 0.35 THEN 'A'::text
                WHEN $7::numeric <= 0.50 THEN 'BBB'::text
                WHEN $7::numeric <= 0.75 THEN 'BB'::text
                ELSE 'B'::text
              END,
              'riskBand', CASE WHEN $7::numeric <= 0.55 THEN 'Investment Grade'::text ELSE 'Speculative'::text END,
              'worstRating', CASE
                WHEN $7::numeric <= 0.25 THEN 'AA'::text
                WHEN $7::numeric <= 0.35 THEN 'A'::text
                WHEN $7::numeric <= 0.50 THEN 'BBB'::text
                WHEN $7::numeric <= 0.75 THEN 'BB'::text
                ELSE 'B'::text
              END,
              'worstRiskWeight', $7::numeric
            ))
            ON CONFLICT (name, key) DO UPDATE
              SET payload = jsonb_build_object(
                'portfolioId', $3::text,
                'totalLoans', (projections.payload->>'totalLoans')::int + 1,
                'totalExposure', (projections.payload->>'totalExposure')::numeric + $4::numeric,
                'totalCapitalRequirement', (projections.payload->>'totalCapitalRequirement')::numeric + $5::numeric,
                'totalExpectedLoss', (projections.payload->>'totalExpectedLoss')::numeric + $6::numeric,
                'sumWeightedRiskWeight', (projections.payload->>'sumWeightedRiskWeight')::numeric + $9::numeric,
                'sumWeightedPD', (projections.payload->>'sumWeightedPD')::numeric + $10::numeric,
                'averageRiskWeight', ((projections.payload->>'sumWeightedRiskWeight')::numeric + $9::numeric) / ((projections.payload->>'totalExposure')::numeric + $4::numeric),
                'averageProbabilityOfDefault', ((projections.payload->>'sumWeightedPD')::numeric + $10::numeric) / ((projections.payload->>'totalExposure')::numeric + $4::numeric),
                'averageRating', CASE
                  WHEN ((projections.payload->>'sumWeightedRiskWeight')::numeric + $9::numeric) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.25 THEN 'AA'::text
                  WHEN ((projections.payload->>'sumWeightedRiskWeight')::numeric + $9::numeric) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.35 THEN 'A'::text
                  WHEN ((projections.payload->>'sumWeightedRiskWeight')::numeric + $9::numeric) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.50 THEN 'BBB'::text
                  WHEN ((projections.payload->>'sumWeightedRiskWeight')::numeric + $9::numeric) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.75 THEN 'BB'::text
                  ELSE 'B'::text
                END,
                'riskBand', CASE WHEN ((projections.payload->>'sumWeightedRiskWeight')::numeric + $9::numeric) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.55 THEN 'Investment Grade'::text ELSE 'Speculative'::text END,
                'worstRating', CASE
                  WHEN $7::numeric > (projections.payload->>'worstRiskWeight')::numeric THEN
                    CASE
                      WHEN $7::numeric <= 0.25 THEN 'AA'::text
                      WHEN $7::numeric <= 0.35 THEN 'A'::text
                      WHEN $7::numeric <= 0.50 THEN 'BBB'::text
                      WHEN $7::numeric <= 0.75 THEN 'BB'::text
                      ELSE 'B'::text
                    END
                  ELSE projections.payload->>'worstRating'
                END,
                'worstRiskWeight', GREATEST($7::numeric, (projections.payload->>'worstRiskWeight')::numeric)
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
            weightedRiskWeight,
            weightedPD,
          ],
        },
      ];
    },
  },
};
