import type { ProjectionConfig } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

type AccountViewPayload = {
  accountId: string;
  currency: string;
  name: string;
};

export const accountViewSlice: ProjectionConfig = {
  projectionName: "AccountView",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    Accountcreated: (payload, { projectionName }) => {
      const p = payload as AccountViewPayload;
      const key = p.accountId;
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
