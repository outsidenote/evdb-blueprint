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

export const portfolioSummarySlice: ProjectionConfig = {
  projectionName: "PortfolioSummary",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanRiskAssessed: (payload, { projectionName }) => {
      const p = payload as PortfolioSummaryPayload;
      const key = p.portfolioId;
      const riskWeight = p.loanAmount > 0 ? p.capitalRequirement / (p.loanAmount * 0.08) : 0;

      function ratingFromWeight(rw: number): string {
        if (rw <= 0.25) return "AA";
        if (rw <= 0.35) return "A";
        if (rw <= 0.50) return "BBB";
        if (rw <= 0.75) return "BB";
        return "B";
      }

      const initialPayload = {
        portfolioId: p.portfolioId,
        totalLoans: 1,
        totalExposure: p.loanAmount,
        totalCapitalRequirement: p.capitalRequirement,
        totalExpectedLoss: p.expectedLoss,
        averageRiskWeight: riskWeight,
        averageProbabilityOfDefault: p.probabilityOfDefault,
        averageRating: ratingFromWeight(riskWeight),
        riskBand: riskWeight <= 0.55 ? "Investment Grade" : "Speculative",
        worstRating: p.creditRating,
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
                'averageRiskWeight', CASE WHEN ((projections.payload->>'totalExposure')::numeric + $4) = 0 THEN 0::numeric
                  ELSE ((projections.payload->>'totalCapitalRequirement')::numeric + $5) / (((projections.payload->>'totalExposure')::numeric + $4) * 0.08)
                  END,
                'averageProbabilityOfDefault', CASE WHEN ((projections.payload->>'totalExposure')::numeric + $4) = 0 THEN 0::numeric
                  ELSE ((projections.payload->>'totalExpectedLoss')::numeric + $6) / (((projections.payload->>'totalExposure')::numeric + $4) * 0.45)
                  END,
                'averageRating', CASE
                  WHEN ((projections.payload->>'totalCapitalRequirement')::numeric + $5) / NULLIF(((projections.payload->>'totalExposure')::numeric + $4) * 0.08, 0) <= 0.25 THEN 'AA'
                  WHEN ((projections.payload->>'totalCapitalRequirement')::numeric + $5) / NULLIF(((projections.payload->>'totalExposure')::numeric + $4) * 0.08, 0) <= 0.35 THEN 'A'
                  WHEN ((projections.payload->>'totalCapitalRequirement')::numeric + $5) / NULLIF(((projections.payload->>'totalExposure')::numeric + $4) * 0.08, 0) <= 0.50 THEN 'BBB'
                  WHEN ((projections.payload->>'totalCapitalRequirement')::numeric + $5) / NULLIF(((projections.payload->>'totalExposure')::numeric + $4) * 0.08, 0) <= 0.75 THEN 'BB'
                  ELSE 'B'
                END,
                'riskBand', CASE
                  WHEN ((projections.payload->>'totalCapitalRequirement')::numeric + $5) / NULLIF(((projections.payload->>'totalExposure')::numeric + $4) * 0.08, 0) <= 0.55 THEN 'Investment Grade'
                  ELSE 'Speculative'
                END,
                'worstRating', CASE
                  WHEN $7 > (CASE projections.payload->>'worstRating'
                    WHEN 'AAA' THEN 0.20 WHEN 'AA' THEN 0.25 WHEN 'A' THEN 0.35
                    WHEN 'BBB' THEN 0.50 WHEN 'BB' THEN 0.75 WHEN 'B' THEN 1.00
                    WHEN 'CCC' THEN 1.50 ELSE 0.50 END)
                  THEN $8
                  ELSE projections.payload->>'worstRating'
                END
              )`,
          params: [
            projectionName,    // $1
            key,               // $2
            JSON.stringify(initialPayload), // $3 initial payload
            p.loanAmount,      // $4
            p.capitalRequirement, // $5
            p.expectedLoss,    // $6
            riskWeight,        // $7 incoming risk weight for worst-rating comparison
            p.creditRating,    // $8 incoming credit rating for worst-rating update
          ],
        },
      ];
    },

  },
};
