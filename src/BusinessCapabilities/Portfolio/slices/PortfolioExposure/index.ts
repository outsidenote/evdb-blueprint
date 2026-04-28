import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

type PortfolioExposurePayload = {
  creditRating: string;
  portfolioId: string;
  avgPD: number;
  exposure: number;
  loanCount: number;
};

export const portfolioExposureSlice: ProjectionConfig = {
  projectionName: "PortfolioExposure",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    LoanRiskAssessed: (payload, { projectionName }) => {
      const p = payload as PortfolioExposurePayload;
      const key = `${p.creditRating}:${p.portfolioId}`;
      return [
        {
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (name, key) DO UPDATE
              SET payload = EXCLUDED.payload`,
          params: [
            projectionName,
            key,
            JSON.stringify(p), // TODO: select specific fields to store
          ],
        },
      ];
    },

  },
};
