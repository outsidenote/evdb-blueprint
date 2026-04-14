import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

// Per-loan shape of the LoanRiskAssessed event
type LoanRiskAssessedEvent = {
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
  simulatedDefaultRate: number;
  tailRiskLoss: number;
  worstCaseLoss: number;
  riskNarrative: string;
};

export const portfolioSummarySlice: ProjectionConfig = {
  projectionName: "PortfolioSummary",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanRiskAssessed: (payload, { projectionName }) => {
      const p = payload as LoanRiskAssessedEvent;
      const key = p.portfolioId;

      // Precompute weighted contributions for this loan
      const weightedRwContrib = p.riskWeight * p.loanAmount;
      const weightedPodContrib = p.probabilityOfDefault * p.loanAmount;

      // Zero-initialised row inserted on first encounter.
      // _worstRiskWeight starts at -1 so any real riskWeight takes over immediately.
      const zeroState = JSON.stringify({
        portfolioId: p.portfolioId,
        totalLoans: 0,
        totalExposure: 0,
        totalCapitalRequirement: 0,
        totalExpectedLoss: 0,
        _weightedRiskWeightSum: 0,
        _weightedPodSum: 0,
        _worstRiskWeight: -1,
        averageRiskWeight: 0,
        averageProbabilityOfDefault: 0,
        averageRating: "",
        riskBand: "",
        worstRating: "",
        loanId: "",
        borrowerName: "",
        acquisitionDate: null,
        maturityDate: null,
        interestRate: 0,
        loanAmount: 0,
        capitalRequirement: 0,
        expectedLoss: 0,
        probabilityOfDefault: 0,
        creditRating: "",
        expectedPortfolioLoss: 0,
        simulatedDefaultRate: 0,
        tailRiskLoss: 0,
        worstCaseLoss: 0,
        riskNarrative: "",
      });

      return [
        // Statement 1: ensure the portfolio row exists (idempotent initialisation)
        {
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (name, key) DO NOTHING`,
          params: [projectionName, key, zeroState],
        },

        // Statement 2: accumulate this loan's values into the portfolio row.
        // The CTE reads the current snapshot, then the UPDATE rebuilds the full
        // payload with recomputed weighted averages and worst-rating tracking.
        {
          sql: `
            WITH computed AS (
              SELECT
                (payload->>'_weightedRiskWeightSum')::numeric + $3  AS new_wrw_sum,
                (payload->>'_weightedPodSum')::numeric       + $4   AS new_wpod_sum,
                (payload->>'totalExposure')::numeric         + $5   AS new_exposure,
                (payload->>'totalCapitalRequirement')::numeric + $6 AS new_total_cr,
                (payload->>'totalExpectedLoss')::numeric     + $7   AS new_total_el,
                (payload->>'totalLoans')::int                + 1    AS new_total_loans,
                GREATEST((payload->>'_worstRiskWeight')::numeric, $8::numeric)
                                                                    AS new_worst_rw,
                CASE
                  WHEN $8::numeric > (payload->>'_worstRiskWeight')::numeric
                    THEN $9::text
                  ELSE payload->>'worstRating'
                END                                                 AS new_worst_rating
              FROM projections
              WHERE name = $1 AND key = $2
            )
            UPDATE projections
            SET payload = jsonb_build_object(
              'portfolioId',               $2,
              'totalLoans',                computed.new_total_loans,
              'totalExposure',             computed.new_exposure,
              'totalCapitalRequirement',   computed.new_total_cr,
              'totalExpectedLoss',         computed.new_total_el,
              '_weightedRiskWeightSum',    computed.new_wrw_sum,
              '_weightedPodSum',           computed.new_wpod_sum,
              '_worstRiskWeight',          computed.new_worst_rw,
              'averageRiskWeight',
                computed.new_wrw_sum / NULLIF(computed.new_exposure, 0),
              'averageProbabilityOfDefault',
                computed.new_wpod_sum / NULLIF(computed.new_exposure, 0),
              'averageRating', CASE
                WHEN computed.new_wrw_sum / NULLIF(computed.new_exposure, 0) <= 0.25 THEN 'AA'
                WHEN computed.new_wrw_sum / NULLIF(computed.new_exposure, 0) <= 0.35 THEN 'A'
                WHEN computed.new_wrw_sum / NULLIF(computed.new_exposure, 0) <= 0.50 THEN 'BBB'
                WHEN computed.new_wrw_sum / NULLIF(computed.new_exposure, 0) <= 0.75 THEN 'BB'
                ELSE 'B'
              END,
              'riskBand', CASE
                WHEN computed.new_wrw_sum / NULLIF(computed.new_exposure, 0) <= 0.55
                  THEN 'Investment Grade'
                ELSE 'Speculative'
              END,
              'worstRating',           computed.new_worst_rating,
              'loanId',                $10,
              'borrowerName',          $11,
              'acquisitionDate',       $12,
              'maturityDate',          $13,
              'interestRate',          $14::numeric,
              'loanAmount',            $5::numeric,
              'capitalRequirement',    $6::numeric,
              'expectedLoss',          $7::numeric,
              'probabilityOfDefault',  $15::numeric,
              'creditRating',          $9,
              'expectedPortfolioLoss', $16::numeric,
              'simulatedDefaultRate',  $17::numeric,
              'tailRiskLoss',          $18::numeric,
              'worstCaseLoss',         $19::numeric,
              'riskNarrative',         $20
            )
            FROM computed
            WHERE projections.name = $1 AND projections.key = $2`,
          params: [
            projectionName,           // $1
            key,                      // $2
            weightedRwContrib,        // $3  Σ(riskWeight × loanAmount) contribution
            weightedPodContrib,       // $4  Σ(probabilityOfDefault × loanAmount) contribution
            p.loanAmount,             // $5
            p.capitalRequirement,     // $6
            p.expectedLoss,           // $7
            p.riskWeight,             // $8
            p.creditRating,           // $9
            p.loanId,                 // $10
            p.borrowerName,           // $11
            p.acquisitionDate,        // $12
            p.maturityDate,           // $13
            p.interestRate,           // $14
            p.probabilityOfDefault,   // $15
            p.expectedPortfolioLoss,  // $16
            p.simulatedDefaultRate,   // $17
            p.tailRiskLoss,           // $18
            p.worstCaseLoss,          // $19
            p.riskNarrative,          // $20
          ],
        },
      ];
    },
  },
};
