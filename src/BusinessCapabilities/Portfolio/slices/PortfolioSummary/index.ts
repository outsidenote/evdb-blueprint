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

function toRating(riskWeight: number): string {
  if (riskWeight <= 0.25) return "AA";
  if (riskWeight <= 0.35) return "A";
  if (riskWeight <= 0.50) return "BBB";
  if (riskWeight <= 0.75) return "BB";
  return "B";
}

function toRiskBand(riskWeight: number): string {
  return riskWeight <= 0.55 ? "Investment Grade" : "Speculative";
}

export const portfolioSummarySlice: ProjectionConfig = {
  projectionName: "PortfolioSummary",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanRiskAssessed: (payload, { projectionName }) => {
      const p = payload as LoanRiskAssessedPayload;
      const key = p.portfolioId;
      const loanRating = toRating(p.riskWeight);
      const loanRiskBand = toRiskBand(p.riskWeight);

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
              'averageRating', $9::text,
              'riskBand', $10::text,
              'worstRating', $9::text
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
                  ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.25 THEN 'AA'
                  WHEN (
                    (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                    + $7::numeric * $4::numeric
                  ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.35 THEN 'A'
                  WHEN (
                    (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                    + $7::numeric * $4::numeric
                  ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.50 THEN 'BBB'
                  WHEN (
                    (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                    + $7::numeric * $4::numeric
                  ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.75 THEN 'BB'
                  ELSE 'B'
                END,
                'riskBand', CASE
                  WHEN (
                    (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                    + $7::numeric * $4::numeric
                  ) / ((projections.payload->>'totalExposure')::numeric + $4::numeric) <= 0.55 THEN 'Investment Grade'
                  ELSE 'Speculative'
                END,
                'worstRating', CASE
                  WHEN $7::numeric > (CASE projections.payload->>'worstRating'
                    WHEN 'AA' THEN 0.25
                    WHEN 'A' THEN 0.35
                    WHEN 'BBB' THEN 0.50
                    WHEN 'BB' THEN 0.75
                    ELSE 999
                  END)
                  THEN $9::text
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
            loanRating,
            loanRiskBand,
          ],
        },
      ];
    },
  },
};
