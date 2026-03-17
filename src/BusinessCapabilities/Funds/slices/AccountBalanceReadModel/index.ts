import type { ProjectionConfig } from "../../../../types/ProjectionFactory.js";
import { ProjectionModeType } from "../../../../types/ProjectionFactory.js";

type FundsWithdrawnPayload = {
  account: string;
  amount: number;
  commission: number;
  currency: string;
  transactionId: string;
};

type FundsDepositApprovedPayload = {
  account: string;
  amount: number;
  currency: string;
  transactionId: string;
};

/**
 * Projection slice: Account Balance Read Model
 *
 * Maintains a running balance per account per currency.
 * Key: `{account}:{currency}` — one row per account/currency pair.
 *
 * - FundsDepositApproved → increases balance by amount
 * - FundsWithdrawn       → decreases balance by (amount + commission)
 *
 * To generate a new projection slice from this template:
 *   1. Set `projectionName` to the name of the new projection.
 *   2. Set `mode` to `idempotent` with a `getIdempotencyKey` that extracts a unique
 *      business key from the payload (e.g. transactionId).
 *   3. Define one handler per message type that should update the read model.
 *   4. Use `meta.projectionName` in SQL params — never hardcode the name.
 *   5. Return null from a handler to ignore a message type.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const accountBalanceReadModelSlice: ProjectionConfig = {
  projectionName: "AccountBalanceReadModel",

  mode: {
    type: ProjectionModeType.Idempotent,
    getIdempotencyKey: (payload) => {
      const p = payload as { transactionId: string; currency: string };
      return `${p.transactionId}:${p.currency}`;
    },
  },

  handlers: {
    FundsDepositApproved: (payload, { projectionName }) => {
      const p = payload as FundsDepositApprovedPayload;
      const key = `${p.account}:${p.currency}`;
      return [
        {
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (name, key) DO UPDATE
              SET payload = jsonb_build_object(
                'account',  $4::text,
                'balance',  COALESCE((projections.payload->>'balance')::numeric, 0) + $5::numeric,
                'currency', $6::text
              )
          `,
          params: [
            projectionName,
            key,
            JSON.stringify({ account: p.account, balance: p.amount, currency: p.currency }),
            p.account,
            p.amount,
            p.currency,
          ],
        },
      ];
    },

    FundsWithdrawn: (payload, { projectionName }) => {
      const p = payload as FundsWithdrawnPayload;
      const key = `${p.account}:${p.currency}`;
      return [
        {
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (name, key) DO UPDATE
              SET payload = jsonb_build_object(
                'account',  $4::text,
                'balance',  COALESCE((projections.payload->>'balance')::numeric, 0) + $5::numeric,
                'currency', $6::text
              )
          `,
          params: [
            projectionName,
            key,
            JSON.stringify({
              account: p.account,
              balance: -(p.amount + p.commission),
              currency: p.currency,
            }),
            p.account,
            -(p.amount + p.commission),
            p.currency,
          ],
        },
      ];
    },
  },
};
