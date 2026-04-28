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

// Rating lookup: riskWeight thresholds → credit rating
function getRating(riskWeight: number): string {
  if (riskWeight <= 0.25) return "AA";
  if (riskWeight <= 0.35) return "A";
  if (riskWeight <= 0.50) return "BBB";
  if (riskWeight <= 0.75) return "BB";
  return "B";
}

// Rank: lower number = worse credit quality (higher riskWeight)
function getRatingRank(rating: string): number {
  const ranks: Record<string, number> = { B: 1, BB: 2, BBB: 3, A: 4, AA: 5 };
  return ranks[rating] ?? 5;
}

export const portfolioSummarySlice: ProjectionConfig = {
  projectionName: "PortfolioSummary",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanRiskAssessed: (payload, { projectionName }) => {
      const p = payload as LoanRiskAssessedPayload;
      const key = p.portfolioId;
      const incomingRating = getRating(p.riskWeight);
      const incomingRiskBand = p.riskWeight <= 0.55 ? "Investment Grade" : "Speculative";
      const incomingRank = getRatingRank(incomingRating);

      return [
        {
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, jsonb_build_object(
              'portfolioId', $11::text,
              'totalLoans', 1::int,
              'totalExposure', $3::numeric,
              'totalCapitalRequirement', $4::numeric,
              'totalExpectedLoss', $5::numeric,
              'averageRiskWeight', $6::numeric,
              'averageProbabilityOfDefault', $7::numeric,
              'averageRating', $8::text,
              'riskBand', $9::text,
              'worstRating', $8::text
            ))
            ON CONFLICT (name, key) DO UPDATE
              SET payload = jsonb_build_object(
                'portfolioId', $11::text,
                'totalLoans', (projections.payload->>'totalLoans')::int + 1,
                'totalExposure', (projections.payload->>'totalExposure')::numeric + $3::numeric,
                'totalCapitalRequirement', (projections.payload->>'totalCapitalRequirement')::numeric + $4::numeric,
                'totalExpectedLoss', (projections.payload->>'totalExpectedLoss')::numeric + $5::numeric,
                'averageRiskWeight', (
                  (projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageRiskWeight')::numeric
                  + $3::numeric * $6::numeric
                ) / ((projections.payload->>'totalExposure')::numeric + $3::numeric),
                'averageProbabilityOfDefault', (
                  (projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageProbabilityOfDefault')::numeric
                  + $3::numeric * $7::numeric
                ) / ((projections.payload->>'totalExposure')::numeric + $3::numeric),
                'averageRating', CASE
                  WHEN ((projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageRiskWeight')::numeric + $3::numeric * $6::numeric) / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.25 THEN 'AA'
                  WHEN ((projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageRiskWeight')::numeric + $3::numeric * $6::numeric) / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.35 THEN 'A'
                  WHEN ((projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageRiskWeight')::numeric + $3::numeric * $6::numeric) / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.50 THEN 'BBB'
                  WHEN ((projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageRiskWeight')::numeric + $3::numeric * $6::numeric) / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.75 THEN 'BB'
                  ELSE 'B'
                END::text,
                'riskBand', CASE
                  WHEN ((projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageRiskWeight')::numeric + $3::numeric * $6::numeric) / ((projections.payload->>'totalExposure')::numeric + $3::numeric) <= 0.55 THEN 'Investment Grade'
                  ELSE 'Speculative'
                END::text,
                'worstRating', CASE
                  WHEN $10::int < (CASE (projections.payload->>'worstRating')
                    WHEN 'B'   THEN 1
                    WHEN 'BB'  THEN 2
                    WHEN 'BBB' THEN 3
                    WHEN 'A'   THEN 4
                    ELSE 5
                  END)
                  THEN $8::text
                  ELSE (projections.payload->>'worstRating')::text
                END
              )`,
          params: [
            projectionName,       // $1
            key,                  // $2
            p.loanAmount,         // $3
            p.capitalRequirement, // $4
            p.expectedLoss,       // $5
            p.riskWeight,         // $6
            p.probabilityOfDefault, // $7
            incomingRating,       // $8
            incomingRiskBand,     // $9
            incomingRank,         // $10
            key,                  // $11 — portfolioId inside jsonb_build_object (cannot reuse $2)
          ],
        },
      ];
    },
  },
};
