import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

type LoanRiskAssessedPayload = {
  creditRating: string;
  portfolioId: string;
  probabilityOfDefault: number;
  loanAmount: number;
};

export const portfolioExposureSlice: ProjectionConfig = {
  projectionName: "PortfolioExposure",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanRiskAssessed: (payload, { projectionName }) => {
      const p = payload as LoanRiskAssessedPayload;
      const key = `${p.portfolioId}:${p.creditRating}`;
      return [
        {
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, jsonb_build_object(
              'creditRating', $3::text,
              'portfolioId', $4::text,
              'avgPD', $5::numeric,
              'exposure', $6::numeric,
              'loanCount', 1::int
            ))
            ON CONFLICT (name, key) DO UPDATE
              SET payload = jsonb_build_object(
                'creditRating', $3::text,
                'portfolioId', $4::text,
                'avgPD', (
                  (projections.payload->>'avgPD')::numeric * (projections.payload->>'exposure')::numeric
                  + $5::numeric * $6::numeric
                ) / ((projections.payload->>'exposure')::numeric + $6::numeric),
                'exposure', (projections.payload->>'exposure')::numeric + $6::numeric,
                'loanCount', (projections.payload->>'loanCount')::int + 1
              )`,
          params: [
            projectionName,
            key,
            p.creditRating,
            p.portfolioId,
            p.probabilityOfDefault,
            p.loanAmount,
          ],
        },
      ];
    },
  },
};
