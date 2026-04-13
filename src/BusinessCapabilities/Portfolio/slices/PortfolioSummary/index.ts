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

const computeRating = (riskWeight: number): string => {
  if (riskWeight <= 0.25) return 'AA';
  if (riskWeight <= 0.35) return 'A';
  if (riskWeight <= 0.50) return 'BBB';
  if (riskWeight <= 0.75) return 'BB';
  return 'B';
};

const computeRiskBand = (riskWeight: number): string =>
  riskWeight <= 0.55 ? 'Investment Grade' : 'Speculative';

// SQL fragment: new weighted-average risk weight
// $7 = incoming riskWeight, $4 = incoming loanAmount
const newAvgRwSql = `(
  (projections.payload->>'averageRiskWeight')::numeric * (projections.payload->>'totalExposure')::numeric
  + $7::numeric * $4::numeric
) / NULLIF((projections.payload->>'totalExposure')::numeric + $4::numeric, 0)`;

export const portfolioSummarySlice: ProjectionConfig = {
  projectionName: "PortfolioSummary",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanRiskAssessed: (payload, { projectionName }) => {
      const p = payload as PortfolioSummaryPayload;
      const key = p.portfolioId;

      // Risk weight derived from capital requirement ratio; computed at endpoint time
      const riskWeight = p.loanAmount > 0 ? p.capitalRequirement / p.loanAmount : 0;

      // Full initial state for the first loan in this portfolio
      const initialPayload = JSON.stringify({
        portfolioId: p.portfolioId,
        totalLoans: 1,
        totalExposure: p.loanAmount,
        totalCapitalRequirement: p.capitalRequirement,
        totalExpectedLoss: p.expectedLoss,
        averageRiskWeight: riskWeight,
        averageProbabilityOfDefault: p.probabilityOfDefault,
        averageRating: computeRating(riskWeight),
        riskBand: computeRiskBand(riskWeight),
        worstRating: p.creditRating,
        worstRiskWeight: riskWeight,
        loanId: p.loanId,
        borrowerName: p.borrowerName,
        loanAmount: p.loanAmount,
        acquisitionDate: p.acquisitionDate,
        maturityDate: p.maturityDate,
        creditRating: p.creditRating,
        capitalRequirement: p.capitalRequirement,
        expectedLoss: p.expectedLoss,
        expectedPortfolioLoss: p.expectedPortfolioLoss,
        interestRate: p.interestRate,
        probabilityOfDefault: p.probabilityOfDefault,
        riskNarrative: p.riskNarrative,
        simulatedDefaultRate: p.simulatedDefaultRate,
        tailRiskLoss: p.tailRiskLoss,
        worstCaseLoss: p.worstCaseLoss,
      });

      // Per-loan fields that overwrite on every update (last loan wins for individual fields)
      const loanFieldsPayload = JSON.stringify({
        loanId: p.loanId,
        borrowerName: p.borrowerName,
        loanAmount: p.loanAmount,
        acquisitionDate: p.acquisitionDate,
        maturityDate: p.maturityDate,
        creditRating: p.creditRating,
        capitalRequirement: p.capitalRequirement,
        expectedLoss: p.expectedLoss,
        expectedPortfolioLoss: p.expectedPortfolioLoss,
        interestRate: p.interestRate,
        probabilityOfDefault: p.probabilityOfDefault,
        riskNarrative: p.riskNarrative,
        simulatedDefaultRate: p.simulatedDefaultRate,
        tailRiskLoss: p.tailRiskLoss,
        worstCaseLoss: p.worstCaseLoss,
      });

      return [
        {
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (name, key) DO UPDATE
              SET payload = projections.payload
                || jsonb_build_object(
                     'totalLoans', (projections.payload->>'totalLoans')::int + 1,
                     'totalExposure', (projections.payload->>'totalExposure')::numeric + $4,
                     'totalCapitalRequirement', (projections.payload->>'totalCapitalRequirement')::numeric + $5,
                     'totalExpectedLoss', (projections.payload->>'totalExpectedLoss')::numeric + $6,
                     'averageRiskWeight', ${newAvgRwSql},
                     'averageProbabilityOfDefault',
                       (
                         (projections.payload->>'averageProbabilityOfDefault')::numeric * (projections.payload->>'totalExposure')::numeric
                         + $8::numeric * $4::numeric
                       ) / NULLIF((projections.payload->>'totalExposure')::numeric + $4::numeric, 0),
                     'averageRating', CASE
                       WHEN ${newAvgRwSql} <= 0.25 THEN 'AA'
                       WHEN ${newAvgRwSql} <= 0.35 THEN 'A'
                       WHEN ${newAvgRwSql} <= 0.50 THEN 'BBB'
                       WHEN ${newAvgRwSql} <= 0.75 THEN 'BB'
                       ELSE 'B'
                     END,
                     'riskBand', CASE
                       WHEN ${newAvgRwSql} <= 0.55 THEN 'Investment Grade'
                       ELSE 'Speculative'
                     END,
                     'worstRating', CASE
                       WHEN $7::numeric > (projections.payload->>'worstRiskWeight')::numeric
                       THEN $9
                       ELSE projections.payload->>'worstRating'
                     END,
                     'worstRiskWeight', GREATEST($7::numeric, (projections.payload->>'worstRiskWeight')::numeric)
                   )
                || $10::jsonb`,
          params: [
            projectionName,           // $1
            key,                      // $2
            initialPayload,           // $3
            p.loanAmount,             // $4 — totalExposure increment & weighted-avg denominator
            p.capitalRequirement,     // $5 — totalCapitalRequirement increment
            p.expectedLoss,           // $6 — totalExpectedLoss increment
            riskWeight,               // $7 — incoming risk weight for weighted avg & worstRating
            p.probabilityOfDefault,   // $8 — averageProbabilityOfDefault weighted avg
            p.creditRating,           // $9 — worstRating candidate
            loanFieldsPayload,        // $10 — per-loan overwrite fields
          ],
        },
      ];
    },
  },
};
