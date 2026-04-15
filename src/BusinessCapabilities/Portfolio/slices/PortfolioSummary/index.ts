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
      // Invert Basel III formula: capitalRequirement = loanAmount × riskWeight × 0.08
      // so riskWeight = capitalRequirement / (loanAmount × 0.08)
      const riskWeight = p.capitalRequirement / (p.loanAmount * 0.08);
      // Weighted PD contribution for portfolio-level average: loanAmount × probabilityOfDefault
      const weightedPD = p.loanAmount * p.probabilityOfDefault;
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
              'weightedPDSum', $7::numeric,
              'worstRiskWeight', $8::numeric,
              'worstRating', $9::text,
              'averageRiskWeight', $8::numeric,
              'averageProbabilityOfDefault', $7::numeric / $4::numeric,
              'averageRating', CASE
                WHEN $8::numeric <= 0.25 THEN 'AA'
                WHEN $8::numeric <= 0.35 THEN 'A'
                WHEN $8::numeric <= 0.50 THEN 'BBB'
                WHEN $8::numeric <= 0.75 THEN 'BB'
                ELSE 'B'
              END,
              'riskBand', CASE
                WHEN $8::numeric <= 0.55 THEN 'Investment Grade'
                ELSE 'Speculative'
              END
            ))
            ON CONFLICT (name, key) DO UPDATE
              SET payload = jsonb_build_object(
                'portfolioId', $3::text,
                'totalLoans', (projections.payload->>'totalLoans')::int + 1,
                'totalExposure', (projections.payload->>'totalExposure')::numeric + $4::numeric,
                'totalCapitalRequirement', (projections.payload->>'totalCapitalRequirement')::numeric + $5::numeric,
                'totalExpectedLoss', (projections.payload->>'totalExpectedLoss')::numeric + $6::numeric,
                'weightedPDSum', (projections.payload->>'weightedPDSum')::numeric + $7::numeric,
                'worstRiskWeight', CASE
                  WHEN $8::numeric > (projections.payload->>'worstRiskWeight')::numeric
                  THEN $8::numeric
                  ELSE (projections.payload->>'worstRiskWeight')::numeric
                END,
                'worstRating', CASE
                  WHEN $8::numeric > (projections.payload->>'worstRiskWeight')::numeric
                  THEN $9::text
                  ELSE (projections.payload->>'worstRating')::text
                END,
                'averageRiskWeight', ((projections.payload->>'totalCapitalRequirement')::numeric + $5::numeric) /
                  (((projections.payload->>'totalExposure')::numeric + $4::numeric) * 0.08),
                'averageProbabilityOfDefault', ((projections.payload->>'weightedPDSum')::numeric + $7::numeric) /
                  ((projections.payload->>'totalExposure')::numeric + $4::numeric),
                'averageRating', CASE
                  WHEN ((projections.payload->>'totalCapitalRequirement')::numeric + $5::numeric) /
                       (((projections.payload->>'totalExposure')::numeric + $4::numeric) * 0.08) <= 0.25 THEN 'AA'
                  WHEN ((projections.payload->>'totalCapitalRequirement')::numeric + $5::numeric) /
                       (((projections.payload->>'totalExposure')::numeric + $4::numeric) * 0.08) <= 0.35 THEN 'A'
                  WHEN ((projections.payload->>'totalCapitalRequirement')::numeric + $5::numeric) /
                       (((projections.payload->>'totalExposure')::numeric + $4::numeric) * 0.08) <= 0.50 THEN 'BBB'
                  WHEN ((projections.payload->>'totalCapitalRequirement')::numeric + $5::numeric) /
                       (((projections.payload->>'totalExposure')::numeric + $4::numeric) * 0.08) <= 0.75 THEN 'BB'
                  ELSE 'B'
                END,
                'riskBand', CASE
                  WHEN ((projections.payload->>'totalCapitalRequirement')::numeric + $5::numeric) /
                       (((projections.payload->>'totalExposure')::numeric + $4::numeric) * 0.08) <= 0.55 THEN 'Investment Grade'
                  ELSE 'Speculative'
                END
              )`,
          params: [projectionName, key, p.portfolioId, p.loanAmount, p.capitalRequirement, p.expectedLoss, weightedPD, riskWeight, p.creditRating],
        },
      ];
    },

  },
};
