import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

// Shape of the incoming LoanRiskAssessed event (per-loan fields)
type LoanRiskAssessedEvent = {
  portfolioId: string;
  loanId: string;
  loanAmount: number;
  capitalRequirement: number;
  expectedLoss: number;
  expectedPortfolioLoss: number;
  probabilityOfDefault: number;
  riskWeight: number;
  creditRating: string;
  borrowerName: string;
  acquisitionDate: string | Date;
  maturityDate: string | Date;
  interestRate: number;
  riskNarrative: string;
  simulatedDefaultRate: number;
  tailRiskLoss: number;
  worstCaseLoss: number;
};

// Shape of what is stored in the projections table (aggregated per portfolio)
type PortfolioSummaryPayload = {
  portfolioId: string;
  totalLoans: number;
  totalExposure: number;
  totalCapitalRequirement: number;
  totalExpectedLoss: number;
  averageRiskWeight: number;
  averageProbabilityOfDefault: number;
  averageRating: string;
  riskBand: string;
  worstRating: string;
  worstRiskWeight: number;
  loanId: string;
  loanAmount: number;
  borrowerName: string;
  acquisitionDate: string | Date;
  maturityDate: string | Date;
  interestRate: number;
  capitalRequirement: number;
  expectedLoss: number;
  probabilityOfDefault: number;
  creditRating: string;
  expectedPortfolioLoss: number;
  simulatedDefaultRate: number;
  tailRiskLoss: number;
  worstCaseLoss: number;
  riskNarrative: string;
};

function ratingFromRiskWeight(rw: number): string {
  if (rw <= 0.25) return "AA";
  if (rw <= 0.35) return "A";
  if (rw <= 0.50) return "BBB";
  if (rw <= 0.75) return "BB";
  return "B";
}

function riskBandFromRiskWeight(rw: number): string {
  return rw <= 0.55 ? "Investment Grade" : "Speculative";
}

export const portfolioSummarySlice: ProjectionConfig = {
  projectionName: "PortfolioSummary",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanRiskAssessed: (payload, { projectionName }) => {
      const p = payload as unknown as LoanRiskAssessedEvent;
      const key = p.portfolioId;

      // Initial payload for the first loan in this portfolio
      const initialPayload: PortfolioSummaryPayload = {
        portfolioId: p.portfolioId,
        totalLoans: 1,
        totalExposure: p.loanAmount,
        totalCapitalRequirement: p.capitalRequirement,
        totalExpectedLoss: p.expectedLoss,
        averageRiskWeight: p.riskWeight,
        averageProbabilityOfDefault: p.probabilityOfDefault,
        averageRating: ratingFromRiskWeight(p.riskWeight),
        riskBand: riskBandFromRiskWeight(p.riskWeight),
        worstRating: p.creditRating,
        worstRiskWeight: p.riskWeight,
        loanId: p.loanId,
        loanAmount: p.loanAmount,
        borrowerName: p.borrowerName,
        acquisitionDate: p.acquisitionDate,
        maturityDate: p.maturityDate,
        interestRate: p.interestRate,
        capitalRequirement: p.capitalRequirement,
        expectedLoss: p.expectedLoss,
        probabilityOfDefault: p.probabilityOfDefault,
        creditRating: p.creditRating,
        expectedPortfolioLoss: p.expectedPortfolioLoss,
        simulatedDefaultRate: p.simulatedDefaultRate,
        tailRiskLoss: p.tailRiskLoss,
        worstCaseLoss: p.worstCaseLoss,
        riskNarrative: p.riskNarrative,
      };

      return [
        {
          // On first loan: INSERT with initial aggregate values computed in TypeScript.
          // On subsequent loans: accumulate totals, recompute weighted averages and derived
          // fields (averageRating, riskBand) entirely in SQL using a derived subquery so
          // intermediate values (new_avg_rw) are computed once and reused.
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (name, key) DO UPDATE
              SET payload = (
                SELECT jsonb_build_object(
                  'portfolioId', projections.payload->>'portfolioId',
                  'totalLoans',              c.new_total_loans,
                  'totalExposure',           c.new_exposure,
                  'totalCapitalRequirement', c.new_total_cap_req,
                  'totalExpectedLoss',       c.new_total_exp_loss,
                  'averageRiskWeight',       c.new_avg_rw,
                  'averageProbabilityOfDefault', c.new_avg_pd,
                  'averageRating', CASE
                    WHEN c.new_avg_rw <= 0.25 THEN 'AA'
                    WHEN c.new_avg_rw <= 0.35 THEN 'A'
                    WHEN c.new_avg_rw <= 0.50 THEN 'BBB'
                    WHEN c.new_avg_rw <= 0.75 THEN 'BB'
                    ELSE 'B'
                  END,
                  'riskBand', CASE
                    WHEN c.new_avg_rw <= 0.55 THEN 'Investment Grade'
                    ELSE 'Speculative'
                  END,
                  'worstRating', CASE
                    WHEN $4::numeric > COALESCE((projections.payload->>'worstRiskWeight')::numeric, 0)
                    THEN $5::text
                    ELSE projections.payload->>'worstRating'
                  END,
                  'worstRiskWeight', GREATEST(
                    $4::numeric,
                    COALESCE((projections.payload->>'worstRiskWeight')::numeric, 0)
                  ),
                  'loanId',               $6::text,
                  'loanAmount',           $7::numeric,
                  'borrowerName',         $8::text,
                  'acquisitionDate',      $9::text,
                  'maturityDate',         $10::text,
                  'interestRate',         $11::numeric,
                  'capitalRequirement',   $12::numeric,
                  'expectedLoss',         $13::numeric,
                  'probabilityOfDefault', $14::numeric,
                  'creditRating',         $5::text,
                  'expectedPortfolioLoss', $15::numeric,
                  'simulatedDefaultRate',  $16::numeric,
                  'tailRiskLoss',          $17::numeric,
                  'worstCaseLoss',         $18::numeric,
                  'riskNarrative',         $19::text
                )
                FROM (
                  SELECT
                    (projections.payload->>'totalLoans')::int + 1 AS new_total_loans,
                    (projections.payload->>'totalExposure')::numeric + $7::numeric AS new_exposure,
                    (projections.payload->>'totalCapitalRequirement')::numeric + $12::numeric AS new_total_cap_req,
                    (projections.payload->>'totalExpectedLoss')::numeric + $13::numeric AS new_total_exp_loss,
                    -- Weighted average: (old_avg * old_weight + new_val * new_weight) / new_total_weight
                    CASE
                      WHEN (projections.payload->>'totalExposure')::numeric + $7::numeric = 0
                      THEN $4::numeric
                      ELSE (
                        (projections.payload->>'averageRiskWeight')::numeric
                          * (projections.payload->>'totalExposure')::numeric
                        + $4::numeric * $7::numeric
                      ) / ((projections.payload->>'totalExposure')::numeric + $7::numeric)
                    END AS new_avg_rw,
                    CASE
                      WHEN (projections.payload->>'totalExposure')::numeric + $7::numeric = 0
                      THEN $14::numeric
                      ELSE (
                        (projections.payload->>'averageProbabilityOfDefault')::numeric
                          * (projections.payload->>'totalExposure')::numeric
                        + $14::numeric * $7::numeric
                      ) / ((projections.payload->>'totalExposure')::numeric + $7::numeric)
                    END AS new_avg_pd
                ) AS c
              )`,
          params: [
            projectionName,           // $1
            key,                      // $2
            JSON.stringify(initialPayload), // $3
            p.riskWeight,             // $4 — used for weighted average and worstRating comparison
            p.creditRating,           // $5 — used for worstRating and creditRating fields
            p.loanId,                 // $6
            p.loanAmount,             // $7 — weight for weighted averages; addend for totalExposure
            p.borrowerName,           // $8
            p.acquisitionDate,        // $9
            p.maturityDate,           // $10
            p.interestRate,           // $11
            p.capitalRequirement,     // $12 — addend for totalCapitalRequirement
            p.expectedLoss,           // $13 — addend for totalExpectedLoss
            p.probabilityOfDefault,   // $14 — used for weighted averageProbabilityOfDefault
            p.expectedPortfolioLoss,  // $15
            p.simulatedDefaultRate,   // $16
            p.tailRiskLoss,           // $17
            p.worstCaseLoss,          // $18
            p.riskNarrative,          // $19
          ],
        },
      ];
    },
  },
};
