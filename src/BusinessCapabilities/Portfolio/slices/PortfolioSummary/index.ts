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

function deriveAverageRating(avgRw: number): string {
  if (avgRw <= 0.25) return "AA";
  if (avgRw <= 0.35) return "A";
  if (avgRw <= 0.50) return "BBB";
  if (avgRw <= 0.75) return "BB";
  return "B";
}

function deriveRiskBand(avgRw: number): string {
  return avgRw <= 0.55 ? "Investment Grade" : "Speculative";
}

export const portfolioSummarySlice: ProjectionConfig = {
  projectionName: "PortfolioSummary",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanRiskAssessed: (payload, { projectionName }) => {
      const p = payload as PortfolioSummaryPayload;
      const key = p.portfolioId;

      // Back-derive adjustedRiskWeight from: capitalRequirement = loanAmount × riskWeight × 0.08
      const riskWeight = p.loanAmount > 0 ? p.capitalRequirement / (p.loanAmount * 0.08) : 0;

      // Initial payload for the first loan in this portfolio (INSERT path)
      const initialPayload = {
        portfolioId: p.portfolioId,
        totalLoans: 1,
        totalExposure: p.loanAmount,
        totalCapitalRequirement: p.capitalRequirement,
        totalExpectedLoss: p.expectedLoss,
        averageRiskWeight: riskWeight,
        averageProbabilityOfDefault: p.probabilityOfDefault,
        averageRating: deriveAverageRating(riskWeight),
        riskBand: deriveRiskBand(riskWeight),
        worstRating: p.creditRating,
        _worstRiskWeight: riskWeight,
        // Per-loan details from this event
        acquisitionDate: p.acquisitionDate,
        borrowerName: p.borrowerName,
        capitalRequirement: p.capitalRequirement,
        creditRating: p.creditRating,
        expectedLoss: p.expectedLoss,
        expectedPortfolioLoss: p.expectedPortfolioLoss,
        interestRate: p.interestRate,
        loanAmount: p.loanAmount,
        loanId: p.loanId,
        maturityDate: p.maturityDate,
        probabilityOfDefault: p.probabilityOfDefault,
        riskNarrative: p.riskNarrative,
        simulatedDefaultRate: p.simulatedDefaultRate,
        tailRiskLoss: p.tailRiskLoss,
        worstCaseLoss: p.worstCaseLoss,
      };

      return [
        {
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (name, key) DO UPDATE
              SET payload = projections.payload || jsonb_build_object(
                'totalLoans', (projections.payload->>'totalLoans')::int + 1,
                'totalExposure', (projections.payload->>'totalExposure')::numeric + $4,
                'totalCapitalRequirement', (projections.payload->>'totalCapitalRequirement')::numeric + $5,
                'totalExpectedLoss', (projections.payload->>'totalExpectedLoss')::numeric + $6,
                'averageRiskWeight', (
                  (projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageRiskWeight')::numeric + $4 * $7
                ) / NULLIF((projections.payload->>'totalExposure')::numeric + $4, 0),
                'averageProbabilityOfDefault', (
                  (projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageProbabilityOfDefault')::numeric + $4 * $8
                ) / NULLIF((projections.payload->>'totalExposure')::numeric + $4, 0),
                'averageRating', CASE
                  WHEN ((projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageRiskWeight')::numeric + $4 * $7)
                    / NULLIF((projections.payload->>'totalExposure')::numeric + $4, 0) <= 0.25 THEN 'AA'
                  WHEN ((projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageRiskWeight')::numeric + $4 * $7)
                    / NULLIF((projections.payload->>'totalExposure')::numeric + $4, 0) <= 0.35 THEN 'A'
                  WHEN ((projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageRiskWeight')::numeric + $4 * $7)
                    / NULLIF((projections.payload->>'totalExposure')::numeric + $4, 0) <= 0.50 THEN 'BBB'
                  WHEN ((projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageRiskWeight')::numeric + $4 * $7)
                    / NULLIF((projections.payload->>'totalExposure')::numeric + $4, 0) <= 0.75 THEN 'BB'
                  ELSE 'B'
                END,
                'riskBand', CASE
                  WHEN ((projections.payload->>'totalExposure')::numeric * (projections.payload->>'averageRiskWeight')::numeric + $4 * $7)
                    / NULLIF((projections.payload->>'totalExposure')::numeric + $4, 0) <= 0.55 THEN 'Investment Grade'
                  ELSE 'Speculative'
                END,
                'worstRating', CASE
                  WHEN $7 > (projections.payload->>'_worstRiskWeight')::numeric THEN $9
                  ELSE projections.payload->>'worstRating'
                END,
                '_worstRiskWeight', CASE
                  WHEN $7 > (projections.payload->>'_worstRiskWeight')::numeric THEN $7::numeric
                  ELSE (projections.payload->>'_worstRiskWeight')::numeric
                END,
                'acquisitionDate', $10::text,
                'borrowerName', $11::text,
                'capitalRequirement', $5,
                'creditRating', $9::text,
                'expectedLoss', $6,
                'expectedPortfolioLoss', $12,
                'interestRate', $13,
                'loanAmount', $4,
                'loanId', $14::text,
                'maturityDate', $15::text,
                'probabilityOfDefault', $8,
                'riskNarrative', $16::text,
                'simulatedDefaultRate', $17,
                'tailRiskLoss', $18,
                'worstCaseLoss', $19
              )`,
          params: [
            projectionName,                  // $1
            key,                             // $2
            JSON.stringify(initialPayload),  // $3
            p.loanAmount,                    // $4
            p.capitalRequirement,            // $5
            p.expectedLoss,                  // $6
            riskWeight,                      // $7
            p.probabilityOfDefault,          // $8
            p.creditRating,                  // $9
            p.acquisitionDate,               // $10
            p.borrowerName,                  // $11
            p.expectedPortfolioLoss,         // $12
            p.interestRate,                  // $13
            p.loanId,                        // $14
            p.maturityDate,                  // $15
            p.riskNarrative,                 // $16
            p.simulatedDefaultRate,          // $17
            p.tailRiskLoss,                  // $18
            p.worstCaseLoss,                 // $19
          ],
        },
      ];
    },
  },
};
