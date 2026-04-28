import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

type LoanRiskAssessedPayload = {
  portfolioId: string;
  loanAmount: number;
  capitalRequirement: number;
  expectedLoss: number;
  probabilityOfDefault: number;
  creditRating: string;
};

export const portfolioSummarySlice: ProjectionConfig = {
  projectionName: "PortfolioSummary",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanRiskAssessed: (payload, { projectionName }) => {
      const p = payload as LoanRiskAssessedPayload;
      const key = p.portfolioId;
      // Basel III: capitalRequirement = loanAmount * riskWeight * 0.08
      // so riskWeight = capitalRequirement / (loanAmount * 0.08)
      const riskWeight = p.capitalRequirement / (p.loanAmount * 0.08);

      return [
        {
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, jsonb_build_object(
              'totalLoans', 1::int,
              'totalExposure', $3::numeric,
              'totalCapitalRequirement', $4::numeric,
              'totalExpectedLoss', $5::numeric,
              'averageProbabilityOfDefault', $6::numeric,
              'averageRiskWeight', $7::numeric,
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
              'worstRating', $8::text
            ))
            ON CONFLICT (name, key) DO UPDATE SET payload = jsonb_build_object(
              'totalLoans', (projections.payload->>'totalLoans')::int + 1,
              'totalExposure', (projections.payload->>'totalExposure')::numeric + $3::numeric,
              'totalCapitalRequirement', (projections.payload->>'totalCapitalRequirement')::numeric + $4::numeric,
              'totalExpectedLoss', (projections.payload->>'totalExpectedLoss')::numeric + $5::numeric,
              'averageProbabilityOfDefault', (
                (projections.payload->>'averageProbabilityOfDefault')::numeric * (projections.payload->>'totalExposure')::numeric
                + $6::numeric * $3::numeric
              ) / ((projections.payload->>'totalExposure')::numeric + $3::numeric),
              'averageRiskWeight', (
                (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                + $7::numeric * $3::numeric
              ) / ((projections.payload->>'totalExposure')::numeric + $3::numeric),
              'averageRating', CASE
                WHEN (
                  (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                  + $7::numeric * $3::numeric
                ) / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.25 THEN 'AA'
                WHEN (
                  (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                  + $7::numeric * $3::numeric
                ) / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.35 THEN 'A'
                WHEN (
                  (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                  + $7::numeric * $3::numeric
                ) / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.50 THEN 'BBB'
                WHEN (
                  (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                  + $7::numeric * $3::numeric
                ) / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.75 THEN 'BB'
                ELSE 'B'
              END,
              'riskBand', CASE
                WHEN (
                  (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                  + $7::numeric * $3::numeric
                ) / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.55 THEN 'Investment Grade'
                ELSE 'Speculative'
              END,
              'worstRating', CASE
                WHEN $7::numeric > (CASE projections.payload->>'worstRating'
                  WHEN 'AAA' THEN 0.20
                  WHEN 'AA' THEN 0.25
                  WHEN 'A' THEN 0.35
                  WHEN 'BBB' THEN 0.50
                  WHEN 'BB' THEN 0.75
                  WHEN 'B' THEN 1.00
                  WHEN 'CCC' THEN 1.50
                  ELSE 0.00
                END)
                THEN $8::text
                ELSE projections.payload->>'worstRating'
              END
            )`,
          params: [
            projectionName,
            key,
            p.loanAmount,
            p.capitalRequirement,
            p.expectedLoss,
            p.probabilityOfDefault,
            riskWeight,
            p.creditRating,
          ],
        },
      ];
    },
  },
};
