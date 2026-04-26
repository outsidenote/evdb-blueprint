import type { ProjectionConfig, ProjectionHandler } from "#abstractions/projections/ProjectionFactory.js";
import { ProjectionModeType } from "#abstractions/projections/ProjectionFactory.js";

type AccountViewPayload = {
  accountId: string;
  currency: string;
  name: string;
};

const handleAccountCreated: ProjectionHandler = (payload, { projectionName }) => {
  const p = payload as AccountViewPayload;
  const key = p.accountId;
  return [
    {
      sql: `
        INSERT INTO projections (name, key, payload)
        VALUES ($1, $2, jsonb_build_object(
          'accountId', $3::text,
          'currency', $4::text,
          'name', $5::text
        ))
        ON CONFLICT (name, key) DO UPDATE
          SET payload = jsonb_build_object(
            'accountId', $3::text,
            'currency', $4::text,
            'name', $5::text
          )`,
      params: [projectionName, key, p.accountId, p.currency, p.name],
    },
  ];
};

export const accountViewSlice: ProjectionConfig = {
  projectionName: "AccountView",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    AccountCreated: handleAccountCreated,
    Accountcreated: handleAccountCreated,
  },
};
