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

function deriveAverageRating(riskWeight: number): string {
  if (riskWeight <= 0.25) return 'AA';
  if (riskWeight <= 0.35) return 'A';
  if (riskWeight <= 0.50) return 'BBB';
  if (riskWeight <= 0.75) return 'BB';
  return 'B';
}

function deriveRiskBand(riskWeight: number): string {
  return riskWeight <= 0.55 ? 'Investment Grade' : 'Speculative';
}

export const portfolioSummarySlice: ProjectionConfig = {
  projectionName: "PortfolioSummary",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanRiskAssessed: (payload, { projectionName }) => {
      const p = payload as PortfolioSummaryPayload;
      const key = p.portfolioId;

      // Initial payload for first loan in portfolio — derived fields computed here in TS.
      // worstRiskWeight is an internal helper field stored for SQL comparisons.
      const initialPayload = {
        portfolioId: p.portfolioId,
        totalLoans: 1,
        totalExposure: p.loanAmount,
        totalCapitalRequirement: p.capitalRequirement,
        totalExpectedLoss: p.expectedLoss,
        averageRiskWeight: p.averageRiskWeight,
        averageProbabilityOfDefault: p.probabilityOfDefault,
        averageRating: deriveAverageRating(p.averageRiskWeight),
        riskBand: deriveRiskBand(p.averageRiskWeight),
        worstRating: p.creditRating,
        worstRiskWeight: p.averageRiskWeight,
        loanId: p.loanId,
        borrowerName: p.borrowerName,
        acquisitionDate: p.acquisitionDate,
        maturityDate: p.maturityDate,
        interestRate: p.interestRate,
        simulatedDefaultRate: p.simulatedDefaultRate,
        tailRiskLoss: p.tailRiskLoss,
        worstCaseLoss: p.worstCaseLoss,
        expectedPortfolioLoss: p.expectedPortfolioLoss,
        riskNarrative: p.riskNarrative,
        loanAmount: p.loanAmount,
        capitalRequirement: p.capitalRequirement,
        expectedLoss: p.expectedLoss,
        probabilityOfDefault: p.probabilityOfDefault,
        creditRating: p.creditRating,
      };

      return [
        {
          // On conflict, EXCLUDED.payload is the proposed initial payload (i.e. the current event).
          // Accumulated fields are computed from existing row + EXCLUDED.
          // averageRiskWeight uses reverse-engineered weighted sum:
          //   new_avg = (old_avg * old_exposure + loan_riskWeight * loan_amount) / new_exposure
          // worstRating updates when incoming riskWeight exceeds stored worst.
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (name, key) DO UPDATE
              SET payload = jsonb_build_object(
                'portfolioId', projections.payload->>'portfolioId',
                'totalLoans', (projections.payload->>'totalLoans')::int + 1,
                'totalExposure',
                  (projections.payload->>'totalExposure')::numeric
                  + (EXCLUDED.payload->>'loanAmount')::numeric,
                'totalCapitalRequirement',
                  (projections.payload->>'totalCapitalRequirement')::numeric
                  + (EXCLUDED.payload->>'capitalRequirement')::numeric,
                'totalExpectedLoss',
                  (projections.payload->>'totalExpectedLoss')::numeric
                  + (EXCLUDED.payload->>'expectedLoss')::numeric,
                'averageRiskWeight', (
                  (projections.payload->>'averageRiskWeight')::numeric
                    * (projections.payload->>'totalExposure')::numeric
                  + (EXCLUDED.payload->>'averageRiskWeight')::numeric
                    * (EXCLUDED.payload->>'loanAmount')::numeric
                ) / NULLIF(
                  (projections.payload->>'totalExposure')::numeric
                  + (EXCLUDED.payload->>'loanAmount')::numeric,
                  0
                ),
                'averageProbabilityOfDefault', (
                  (projections.payload->>'averageProbabilityOfDefault')::numeric
                    * (projections.payload->>'totalExposure')::numeric
                  + (EXCLUDED.payload->>'probabilityOfDefault')::numeric
                    * (EXCLUDED.payload->>'loanAmount')::numeric
                ) / NULLIF(
                  (projections.payload->>'totalExposure')::numeric
                  + (EXCLUDED.payload->>'loanAmount')::numeric,
                  0
                ),
                'averageRating', CASE
                  WHEN (
                    (projections.payload->>'averageRiskWeight')::numeric
                      * (projections.payload->>'totalExposure')::numeric
                    + (EXCLUDED.payload->>'averageRiskWeight')::numeric
                      * (EXCLUDED.payload->>'loanAmount')::numeric
                  ) / NULLIF(
                    (projections.payload->>'totalExposure')::numeric
                    + (EXCLUDED.payload->>'loanAmount')::numeric,
                    0
                  ) <= 0.25 THEN 'AA'
                  WHEN (
                    (projections.payload->>'averageRiskWeight')::numeric
                      * (projections.payload->>'totalExposure')::numeric
                    + (EXCLUDED.payload->>'averageRiskWeight')::numeric
                      * (EXCLUDED.payload->>'loanAmount')::numeric
                  ) / NULLIF(
                    (projections.payload->>'totalExposure')::numeric
                    + (EXCLUDED.payload->>'loanAmount')::numeric,
                    0
                  ) <= 0.35 THEN 'A'
                  WHEN (
                    (projections.payload->>'averageRiskWeight')::numeric
                      * (projections.payload->>'totalExposure')::numeric
                    + (EXCLUDED.payload->>'averageRiskWeight')::numeric
                      * (EXCLUDED.payload->>'loanAmount')::numeric
                  ) / NULLIF(
                    (projections.payload->>'totalExposure')::numeric
                    + (EXCLUDED.payload->>'loanAmount')::numeric,
                    0
                  ) <= 0.50 THEN 'BBB'
                  WHEN (
                    (projections.payload->>'averageRiskWeight')::numeric
                      * (projections.payload->>'totalExposure')::numeric
                    + (EXCLUDED.payload->>'averageRiskWeight')::numeric
                      * (EXCLUDED.payload->>'loanAmount')::numeric
                  ) / NULLIF(
                    (projections.payload->>'totalExposure')::numeric
                    + (EXCLUDED.payload->>'loanAmount')::numeric,
                    0
                  ) <= 0.75 THEN 'BB'
                  ELSE 'B'
                END,
                'riskBand', CASE
                  WHEN (
                    (projections.payload->>'averageRiskWeight')::numeric
                      * (projections.payload->>'totalExposure')::numeric
                    + (EXCLUDED.payload->>'averageRiskWeight')::numeric
                      * (EXCLUDED.payload->>'loanAmount')::numeric
                  ) / NULLIF(
                    (projections.payload->>'totalExposure')::numeric
                    + (EXCLUDED.payload->>'loanAmount')::numeric,
                    0
                  ) <= 0.55 THEN 'Investment Grade'
                  ELSE 'Speculative'
                END,
                'worstRating', CASE
                  WHEN (EXCLUDED.payload->>'averageRiskWeight')::numeric
                    > (projections.payload->>'worstRiskWeight')::numeric
                  THEN EXCLUDED.payload->>'creditRating'
                  ELSE projections.payload->>'worstRating'
                END,
                'worstRiskWeight', GREATEST(
                  (EXCLUDED.payload->>'averageRiskWeight')::numeric,
                  (projections.payload->>'worstRiskWeight')::numeric
                ),
                'loanId', EXCLUDED.payload->>'loanId',
                'borrowerName', EXCLUDED.payload->>'borrowerName',
                'acquisitionDate', EXCLUDED.payload->>'acquisitionDate',
                'maturityDate', EXCLUDED.payload->>'maturityDate',
                'interestRate', EXCLUDED.payload->'interestRate',
                'simulatedDefaultRate', EXCLUDED.payload->'simulatedDefaultRate',
                'tailRiskLoss', EXCLUDED.payload->'tailRiskLoss',
                'worstCaseLoss', EXCLUDED.payload->'worstCaseLoss',
                'expectedPortfolioLoss', EXCLUDED.payload->'expectedPortfolioLoss',
                'riskNarrative', EXCLUDED.payload->>'riskNarrative',
                'loanAmount', EXCLUDED.payload->'loanAmount',
                'capitalRequirement', EXCLUDED.payload->'capitalRequirement',
                'expectedLoss', EXCLUDED.payload->'expectedLoss',
                'probabilityOfDefault', EXCLUDED.payload->'probabilityOfDefault',
                'creditRating', EXCLUDED.payload->>'creditRating'
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
