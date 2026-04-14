import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

type LoanRiskAssessedPayload = {
  portfolioId: string;
  loanId: string;
  loanAmount: number;
  capitalRequirement: number;
  expectedLoss: number;
  probabilityOfDefault: number;
  creditRating: string;
  averageRiskWeight: number; // individual loan's risk weight
  acquisitionDate: Date;
  borrowerName: string;
  expectedPortfolioLoss: number;
  interestRate: number;
  maturityDate: Date;
  riskNarrative: string;
  simulatedDefaultRate: number;
  tailRiskLoss: number;
  worstCaseLoss: number;
};

function deriveRating(riskWeight: number): string {
  if (riskWeight <= 0.25) return "AA";
  if (riskWeight <= 0.35) return "A";
  if (riskWeight <= 0.50) return "BBB";
  if (riskWeight <= 0.75) return "BB";
  return "B";
}

function deriveRiskBand(riskWeight: number): string {
  return riskWeight <= 0.55 ? "Investment Grade" : "Speculative";
}

export const portfolioSummarySlice: ProjectionConfig = {
  projectionName: "PortfolioSummary",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanRiskAssessed: (payload, { projectionName }) => {
      const p = payload as LoanRiskAssessedPayload;
      const key = p.portfolioId;
      const riskWeight = Number(p.averageRiskWeight);
      const loanAmount = Number(p.loanAmount);
      const pd = Number(p.probabilityOfDefault);

      const initialPayload = {
        portfolioId: p.portfolioId,
        totalLoans: 1,
        totalExposure: loanAmount,
        totalCapitalRequirement: Number(p.capitalRequirement),
        totalExpectedLoss: Number(p.expectedLoss),
        averageRiskWeight: riskWeight,
        averageProbabilityOfDefault: pd,
        averageRating: deriveRating(riskWeight),
        riskBand: deriveRiskBand(riskWeight),
        worstRating: p.creditRating,
        worstRiskWeight: riskWeight,
      };

      return [
        {
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (name, key) DO UPDATE
              SET payload = projections.payload || jsonb_build_object(
                'totalLoans', (projections.payload->>'totalLoans')::int + 1,
                'totalExposure', (projections.payload->>'totalExposure')::numeric + $4::numeric,
                'totalCapitalRequirement', (projections.payload->>'totalCapitalRequirement')::numeric + $5::numeric,
                'totalExpectedLoss', (projections.payload->>'totalExpectedLoss')::numeric + $6::numeric,
                'averageRiskWeight', (
                  (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                  + $7::numeric * $4::numeric
                ) / NULLIF((projections.payload->>'totalExposure')::numeric + $4::numeric, 0),
                'averageProbabilityOfDefault', (
                  (projections.payload->>'averageProbabilityOfDefault')::numeric * (projections.payload->>'totalExposure')::numeric
                  + $8::numeric * $4::numeric
                ) / NULLIF((projections.payload->>'totalExposure')::numeric + $4::numeric, 0),
                'averageRating', CASE
                  WHEN (
                    (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                    + $7::numeric * $4::numeric
                  ) / NULLIF((projections.payload->>'totalExposure')::numeric + $4::numeric, 0) <= 0.25 THEN 'AA'
                  WHEN (
                    (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                    + $7::numeric * $4::numeric
                  ) / NULLIF((projections.payload->>'totalExposure')::numeric + $4::numeric, 0) <= 0.35 THEN 'A'
                  WHEN (
                    (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                    + $7::numeric * $4::numeric
                  ) / NULLIF((projections.payload->>'totalExposure')::numeric + $4::numeric, 0) <= 0.50 THEN 'BBB'
                  WHEN (
                    (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                    + $7::numeric * $4::numeric
                  ) / NULLIF((projections.payload->>'totalExposure')::numeric + $4::numeric, 0) <= 0.75 THEN 'BB'
                  ELSE 'B'
                END,
                'riskBand', CASE
                  WHEN (
                    (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
                    + $7::numeric * $4::numeric
                  ) / NULLIF((projections.payload->>'totalExposure')::numeric + $4::numeric, 0) <= 0.55
                  THEN 'Investment Grade'
                  ELSE 'Speculative'
                END,
                'worstRating', CASE
                  WHEN $7::numeric > (projections.payload->>'worstRiskWeight')::numeric
                  THEN $9::text
                  ELSE projections.payload->>'worstRating'
                END,
                'worstRiskWeight', GREATEST($7::numeric, (projections.payload->>'worstRiskWeight')::numeric)
              )`,
          params: [
            projectionName,                       // $1
            key,                                  // $2
            JSON.stringify(initialPayload),       // $3
            loanAmount,                           // $4
            Number(p.capitalRequirement),         // $5
            Number(p.expectedLoss),               // $6
            riskWeight,                           // $7
            pd,                                   // $8
            p.creditRating,                       // $9
          ],
        },
      ];
    },
  },
};
