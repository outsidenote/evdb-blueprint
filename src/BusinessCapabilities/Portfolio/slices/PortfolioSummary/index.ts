import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

type PortfolioSummaryPayload = {
  portfolioId: string;
  averageProbabilityOfDefault: number;
  averageRating: string;
  averageRiskWeight: number;
  riskBand: string;
  totalCapitalRequirement: number;
  totalExpectedLoss: number;
  totalExposure: number;
  totalLoans: number;
  worstRating: string;
  acquisitionDate: Date;
  borrowerName: string;
  capitalRequirement: number;
  creditRating: string;
  expectedLoss: number;
  expectedPortfolioLoss: number;
  interestRate: number;
  loanAmount: number;
  loanId: string;
  maturityDate: Date;
  probabilityOfDefault: number;
  riskNarrative: string;
  simulatedDefaultRate: number;
  tailRiskLoss: number;
  worstCaseLoss: number;
};

function getRating(rw: number): string {
  if (rw <= 0.25) return "AA";
  if (rw <= 0.35) return "A";
  if (rw <= 0.50) return "BBB";
  if (rw <= 0.75) return "BB";
  return "B";
}

function getRiskBand(rw: number): string {
  return rw <= 0.55 ? "Investment Grade" : "Speculative";
}

// Weighted-average risk weight expression reused across CASE branches in the UPDATE
const NEW_ARW = `
  ((projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
    + (EXCLUDED.payload->>'averageRiskWeight')::numeric * (EXCLUDED.payload->>'loanAmount')::numeric)
  / NULLIF((projections.payload->>'totalExposure')::numeric + (EXCLUDED.payload->>'loanAmount')::numeric, 0)
`.trim();

export const portfolioSummarySlice: ProjectionConfig = {
  projectionName: "PortfolioSummary",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanRiskAssessed: (payload, { projectionName }) => {
      const p = payload as PortfolioSummaryPayload;
      const key = p.portfolioId;
      const rw = Number(p.averageRiskWeight);

      // Initial payload for a brand-new portfolio row (first loan)
      const initialPayload = {
        portfolioId: p.portfolioId,
        loanId: p.loanId,
        borrowerName: p.borrowerName,
        loanAmount: p.loanAmount,
        capitalRequirement: p.capitalRequirement,
        expectedLoss: p.expectedLoss,
        probabilityOfDefault: p.probabilityOfDefault,
        creditRating: p.creditRating,
        riskNarrative: p.riskNarrative,
        interestRate: p.interestRate,
        maturityDate: p.maturityDate,
        acquisitionDate: p.acquisitionDate,
        simulatedDefaultRate: p.simulatedDefaultRate,
        tailRiskLoss: p.tailRiskLoss,
        worstCaseLoss: p.worstCaseLoss,
        expectedPortfolioLoss: p.expectedPortfolioLoss,
        // Aggregate fields — seeded for a single loan
        totalLoans: 1,
        totalExposure: p.loanAmount,
        totalCapitalRequirement: p.capitalRequirement,
        totalExpectedLoss: p.expectedLoss,
        averageRiskWeight: rw,
        averageProbabilityOfDefault: p.probabilityOfDefault,
        averageRating: getRating(rw),
        riskBand: getRiskBand(rw),
        worstRating: p.creditRating,
        _worstRiskWeight: rw, // internal tracker for worst-rating comparisons
      };

      return [
        {
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (name, key) DO UPDATE
              SET payload = (
                -- Keep existing per-loan + aggregate fields as base
                projections.payload
                -- Overwrite per-loan fields with values from the new event
                -- (strip aggregate keys so we recompute them below)
                || (EXCLUDED.payload - '{totalLoans,totalExposure,totalCapitalRequirement,totalExpectedLoss,averageRiskWeight,averageProbabilityOfDefault,averageRating,riskBand,worstRating,_worstRiskWeight}'::text[])
                -- Recompute all aggregate fields
                || jsonb_build_object(
                  'totalLoans',
                    (projections.payload->>'totalLoans')::int + 1,
                  'totalExposure',
                    (projections.payload->>'totalExposure')::numeric + (EXCLUDED.payload->>'loanAmount')::numeric,
                  'totalCapitalRequirement',
                    (projections.payload->>'totalCapitalRequirement')::numeric + (EXCLUDED.payload->>'capitalRequirement')::numeric,
                  'totalExpectedLoss',
                    (projections.payload->>'totalExpectedLoss')::numeric + (EXCLUDED.payload->>'expectedLoss')::numeric,
                  'averageRiskWeight',
                    ${NEW_ARW},
                  'averageProbabilityOfDefault',
                    ((projections.payload->>'averageProbabilityOfDefault')::numeric * (projections.payload->>'totalExposure')::numeric
                      + (EXCLUDED.payload->>'probabilityOfDefault')::numeric * (EXCLUDED.payload->>'loanAmount')::numeric)
                    / NULLIF((projections.payload->>'totalExposure')::numeric + (EXCLUDED.payload->>'loanAmount')::numeric, 0),
                  'averageRating', CASE
                    WHEN (${NEW_ARW}) <= 0.25 THEN 'AA'
                    WHEN (${NEW_ARW}) <= 0.35 THEN 'A'
                    WHEN (${NEW_ARW}) <= 0.50 THEN 'BBB'
                    WHEN (${NEW_ARW}) <= 0.75 THEN 'BB'
                    ELSE 'B'
                  END,
                  'riskBand', CASE
                    WHEN (${NEW_ARW}) <= 0.55 THEN 'Investment Grade'
                    ELSE 'Speculative'
                  END,
                  'worstRating', CASE
                    WHEN (EXCLUDED.payload->>'_worstRiskWeight')::numeric > (projections.payload->>'_worstRiskWeight')::numeric
                    THEN EXCLUDED.payload->>'creditRating'
                    ELSE projections.payload->>'worstRating'
                  END,
                  '_worstRiskWeight', CASE
                    WHEN (EXCLUDED.payload->>'_worstRiskWeight')::numeric > (projections.payload->>'_worstRiskWeight')::numeric
                    THEN (EXCLUDED.payload->>'_worstRiskWeight')::numeric
                    ELSE (projections.payload->>'_worstRiskWeight')::numeric
                  END
                )
              )`,
          params: [
            projectionName,
            key,
            JSON.stringify(initialPayload),
          ],
        },
      ];
    },
  },
};
