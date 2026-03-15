import type { ProjectionConfig } from "../../../../types/ProjectionFactory.js";
import { idempotentProjection } from "../../../../types/ProjectionFactory.js";


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
 * Maintains a running balance per account.
 * Key: account UUID
 *
 * - FundsDepositApproved → increases balance by amount
 * - FundsWithdrawn       → decreases balance by (amount + commission)
 *
 * Notes:
 * - Assumes one currency per account. For multi-currency, use `${account}:${currency}` as key.
 * - For real financial systems, prefer integer minor units or decimal strings over JS number.
 *
 * To generate a new projection slice from this template:
 *   1. Set `projectionName` to the name of the new projection.
 *   2. Define one handler per message type that should update the read model.
 *   3. Use `meta.projectionName` in SQL params — never hardcode the name.
 *   4. Return null from a handler to ignore a message type.
 *   5. Use idempotentProjection() for accumulating projections (running totals, counters).
 *      Use a plain SqlQuery for naturally idempotent operations (UPSERT / DELETE).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const accountBalanceReadModelSlice: ProjectionConfig = {
  projectionName: "AccountBalanceReadModel",

  handlers: {
    FundsDepositApproved: idempotentProjection(
      (p: FundsDepositApprovedPayload, _meta) => p.transactionId,
      (p, { projectionName }) => ({
        sql: `
          INSERT INTO projections (name, key, payload)
          VALUES ($1, $2, $3::jsonb)
          ON CONFLICT (name, key) DO UPDATE
            SET payload = jsonb_build_object(
              'account',  $2,
              'balance',  COALESCE((projections.payload->>'balance')::numeric, 0) + $4::numeric,
              'currency', COALESCE(projections.payload->>'currency', $5)
            ),
            updated_at = NOW()
        `,
        params: [
          projectionName,
          p.account,
          JSON.stringify({ account: p.account, balance: p.amount, currency: p.currency }),
          p.amount,
          p.currency,
        ],
      }),
    ),

    FundsWithdrawn: idempotentProjection(
      (p: FundsWithdrawnPayload, _meta) => p.transactionId,
      (p, { projectionName }) => ({
        sql: `
          INSERT INTO projections (name, key, payload)
          VALUES ($1, $2, $3::jsonb)
          ON CONFLICT (name, key) DO UPDATE
            SET payload = jsonb_build_object(
              'account',  $2,
              'balance',  COALESCE((projections.payload->>'balance')::numeric, 0) + $4::numeric,
              'currency', COALESCE(projections.payload->>'currency', $5)
            ),
            updated_at = NOW()
        `,
        params: [
          projectionName,
          p.account,
          JSON.stringify({ account: p.account, balance: -(p.amount + p.commission), currency: p.currency }),
          -(p.amount + p.commission),
          p.currency,
        ],
      }),
    ),
  },
};
