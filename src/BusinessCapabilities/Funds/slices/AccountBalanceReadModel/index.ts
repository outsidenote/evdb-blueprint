import type { ProjectionConfig, SqlQuery } from "../../../../types/ProjectionFactory.js";

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
 * Single-statement idempotent balance accumulation using a CTE.
 *
 * The CTE atomically:
 *   1. Inserts an idempotency key (outboxId) — ON CONFLICT DO NOTHING makes replay a no-op.
 *   2. Upserts the balance snapshot — only executes if the idempotency insert succeeded.
 *
 * A single SQL round-trip; no explicit transaction needed — the CTE is atomic at the DB level.
 */
function accumulateBalance(
  projectionName: string,
  transactionId: string,
  account: string,
  currency: string,
  delta: number,
): SqlQuery {
  return {
    sql: `
      WITH inserted_idempotency AS (
        INSERT INTO projection_idempotency (projection_name, business_key)
        VALUES ($1, $2)
        ON CONFLICT (projection_name, business_key) DO NOTHING
        RETURNING 1
      )
      INSERT INTO projections (name, key, payload)
      SELECT $3, $4, $5::jsonb
      WHERE EXISTS (SELECT 1 FROM inserted_idempotency)
      ON CONFLICT (name, key) DO UPDATE
        SET payload = jsonb_build_object(
          'account',  $4,
          'balance',  COALESCE((projections.payload->>'balance')::numeric, 0) + $6::numeric,
          'currency', COALESCE(projections.payload->>'currency', $7)
        ),
        updated_at = NOW()
    `,
    params: [
      projectionName,
      transactionId,
      projectionName,
      account,
      JSON.stringify({ account, balance: delta, currency }),
      delta,
      currency,
    ],
  };
}

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
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const accountBalanceReadModelSlice: ProjectionConfig = {
  projectionName: "AccountBalanceReadModel",

  handlers: {
    FundsDepositApproved: (payload, { projectionName }) => {
      const { account, amount, currency, transactionId } = payload as FundsDepositApprovedPayload;
      return accumulateBalance(projectionName, transactionId, account, currency, amount);
    },

    FundsWithdrawn: (payload, { projectionName }) => {
      const { account, amount, commission, currency, transactionId } = payload as FundsWithdrawnPayload;
      return accumulateBalance(projectionName, transactionId, account, currency, -(amount + commission));
    },
  },
};
