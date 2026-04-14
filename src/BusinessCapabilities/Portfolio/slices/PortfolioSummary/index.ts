import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

type PortfolioSummaryPayload = {
  portfolioId: string;
  loanId: string;
  loanAmount: number;
  capitalRequirement: number;
  expectedLoss: number;
  probabilityOfDefault: number;
  riskWeight: number;
  creditRating: string;
  borrowerName: string;
  acquisitionDate: Date;
  maturityDate: Date;
  interestRate: number;
  expectedPortfolioLoss: number;
  riskNarrative: string;
  simulatedDefaultRate: number;
  tailRiskLoss: number;
  worstCaseLoss: number;
};

function deriveAverageRating(w: number): string {
  if (w <= 0.25) return "AA";
  if (w <= 0.35) return "A";
  if (w <= 0.50) return "BBB";
  if (w <= 0.75) return "BB";
  return "B";
}

function deriveRiskBand(w: number): string {
  return w <= 0.55 ? "Investment Grade" : "Speculative";
}

export const portfolioSummarySlice: ProjectionConfig = {
  projectionName: "PortfolioSummary",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanRiskAssessed: (payload, { projectionName }) => {
      const p = payload as PortfolioSummaryPayload;
      const key = p.portfolioId;
      const loanAmount = Number(p.loanAmount);
      const capitalRequirement = Number(p.capitalRequirement);
      const expectedLoss = Number(p.expectedLoss);
      const riskWeight = Number(p.riskWeight);
      const probabilityOfDefault = Number(p.probabilityOfDefault);

      // Intermediate sums enable correct weighted-average updates on each subsequent UPSERT
      const sumRiskWeightedExposure = riskWeight * loanAmount;
      const sumProbWeightedExposure = probabilityOfDefault * loanAmount;
      const initialAvgRiskWeight =
        loanAmount > 0 ? sumRiskWeightedExposure / loanAmount : riskWeight;
      const initialAvgProbDefault =
        loanAmount > 0 ? sumProbWeightedExposure / loanAmount : probabilityOfDefault;

      // Full initial payload computed in JS for the INSERT path (first loan in portfolio)
      const initialPayload = {
        portfolioId: p.portfolioId,
        totalLoans: 1,
        totalExposure: loanAmount,
        totalCapitalRequirement: capitalRequirement,
        totalExpectedLoss: expectedLoss,
        sumRiskWeightedExposure,
        sumProbWeightedExposure,
        averageRiskWeight: initialAvgRiskWeight,
        averageProbabilityOfDefault: initialAvgProbDefault,
        averageRating: deriveAverageRating(initialAvgRiskWeight),
        riskBand: deriveRiskBand(initialAvgRiskWeight),
        worstRating: p.creditRating,
        worstRiskWeight: riskWeight,
        borrowerName: p.borrowerName,
        loanId: p.loanId,
        loanAmount,
        capitalRequirement,
        expectedLoss,
        creditRating: p.creditRating,
        acquisitionDate: p.acquisitionDate,
        maturityDate: p.maturityDate,
        interestRate: Number(p.interestRate),
        expectedPortfolioLoss: Number(p.expectedPortfolioLoss),
        riskNarrative: p.riskNarrative,
        simulatedDefaultRate: Number(p.simulatedDefaultRate),
        tailRiskLoss: Number(p.tailRiskLoss),
        worstCaseLoss: Number(p.worstCaseLoss),
        probabilityOfDefault,
      };

      return [
        {
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (name, key) DO UPDATE
              SET payload = (
                WITH vals AS (
                  SELECT
                    (projections.payload->>'totalLoans')::int + 1
                      AS totalLoans,
                    (projections.payload->>'totalExposure')::numeric + $4::numeric
                      AS totalExposure,
                    (projections.payload->>'totalCapitalRequirement')::numeric + $5::numeric
                      AS totalCapitalRequirement,
                    (projections.payload->>'totalExpectedLoss')::numeric + $6::numeric
                      AS totalExpectedLoss,
                    (projections.payload->>'sumRiskWeightedExposure')::numeric + ($7::numeric * $4::numeric)
                      AS sumRiskWeightedExposure,
                    (projections.payload->>'sumProbWeightedExposure')::numeric + ($8::numeric * $4::numeric)
                      AS sumProbWeightedExposure,
                    CASE WHEN $7::numeric > (projections.payload->>'worstRiskWeight')::numeric
                         THEN $9::text
                         ELSE projections.payload->>'worstRating'
                    END AS worstRating,
                    CASE WHEN $7::numeric > (projections.payload->>'worstRiskWeight')::numeric
                         THEN $7::numeric
                         ELSE (projections.payload->>'worstRiskWeight')::numeric
                    END AS worstRiskWeight
                ),
                derived AS (
                  SELECT
                    vals.*,
                    CASE WHEN vals.totalExposure > 0
                         THEN vals.sumRiskWeightedExposure / vals.totalExposure
                         ELSE $7::numeric
                    END AS avgRiskWeight,
                    CASE WHEN vals.totalExposure > 0
                         THEN vals.sumProbWeightedExposure / vals.totalExposure
                         ELSE $8::numeric
                    END AS avgProbDefault
                  FROM vals
                )
                SELECT jsonb_build_object(
                  'portfolioId',                $2,
                  'totalLoans',                 derived.totalLoans,
                  'totalExposure',              derived.totalExposure,
                  'totalCapitalRequirement',    derived.totalCapitalRequirement,
                  'totalExpectedLoss',          derived.totalExpectedLoss,
                  'sumRiskWeightedExposure',    derived.sumRiskWeightedExposure,
                  'sumProbWeightedExposure',    derived.sumProbWeightedExposure,
                  'averageRiskWeight',          derived.avgRiskWeight,
                  'averageProbabilityOfDefault', derived.avgProbDefault,
                  'averageRating', CASE
                    WHEN derived.avgRiskWeight <= 0.25 THEN 'AA'
                    WHEN derived.avgRiskWeight <= 0.35 THEN 'A'
                    WHEN derived.avgRiskWeight <= 0.50 THEN 'BBB'
                    WHEN derived.avgRiskWeight <= 0.75 THEN 'BB'
                    ELSE 'B'
                  END,
                  'riskBand', CASE
                    WHEN derived.avgRiskWeight <= 0.55 THEN 'Investment Grade'
                    ELSE 'Speculative'
                  END,
                  'worstRating',           derived.worstRating,
                  'worstRiskWeight',       derived.worstRiskWeight,
                  'borrowerName',          $10::text,
                  'loanId',                $11::text,
                  'loanAmount',            $4::numeric,
                  'capitalRequirement',    $5::numeric,
                  'expectedLoss',          $6::numeric,
                  'creditRating',          $9::text,
                  'acquisitionDate',       $12::text,
                  'maturityDate',          $13::text,
                  'interestRate',          $14::numeric,
                  'expectedPortfolioLoss', $15::numeric,
                  'riskNarrative',         $16::text,
                  'simulatedDefaultRate',  $17::numeric,
                  'tailRiskLoss',          $18::numeric,
                  'worstCaseLoss',         $19::numeric,
                  'probabilityOfDefault',  $8::numeric
                )
                FROM derived
              )`,
          params: [
            projectionName,                  // $1
            key,                             // $2
            JSON.stringify(initialPayload),  // $3 — full initial state for INSERT
            loanAmount,                      // $4
            capitalRequirement,              // $5
            expectedLoss,                    // $6
            riskWeight,                      // $7
            probabilityOfDefault,            // $8
            p.creditRating,                  // $9  (also used for worstRating comparison)
            p.borrowerName,                  // $10
            p.loanId,                        // $11
            p.acquisitionDate,               // $12
            p.maturityDate,                  // $13
            Number(p.interestRate),          // $14
            Number(p.expectedPortfolioLoss), // $15
            p.riskNarrative,                 // $16
            Number(p.simulatedDefaultRate),  // $17
            Number(p.tailRiskLoss),          // $18
            Number(p.worstCaseLoss),         // $19
          ],
        },
      ];
    },
  },
};
