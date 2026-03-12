import type { ProjectionConfig } from "../../../../types/ProjectionFactory.js";

type FundsWithdrawalApprovedPayload = {
  account: string;
  currency: string;
  amount: number;
  session: string;
};

type WithAccountPayload = {
  account: string;
};

/**
 * Projection slice: Pending Withdrawal Lookup
 *
 * Maintains a key/value read model of withdrawals currently in-process.
 * Key: account UUID
 *
 * Event order: FundsWithdrawalApproved → (commission calc) → FundsWithdrawn
 * "Pending" = approved but not yet withdrawn.
 *
 * - FundsWithdrawalApproved → UPSERT (withdrawal approved, now in-process)
 * - FundsWithdrawn          → DELETE (withdrawal completed, leaves pending)
 *
 * Note: FundsWithdrawalDeclined is NOT handled — it is mutually exclusive with
 * FundsWithdrawalApproved, so a row for this account never exists in this projection.
 *
 * ── Blueprint note ────────────────────────────────────────────────────────────
 * To generate a new projection slice from this template:
 *   1. Set `projectionName` to the name of the new projection.
 *   2. Define one handler per message type that should update the read model.
 *   3. Use `meta.projectionName` in SQL params — never hardcode the name.
 *   4. Return null from a handler to ignore a message type.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const pendingWithdrawalLookupSlice: ProjectionConfig = {
  projectionName: "PendingWithdrawalLookup",

  handlers: {
    FundsWithdrawalApproved: (payload, { projectionName }) => {
      const { account, currency, amount, session } = payload as FundsWithdrawalApprovedPayload;
      return {
        sql: `
          INSERT INTO projections (name, key, payload)
          VALUES ($1, $2, $3::jsonb)
          ON CONFLICT (name, key) DO UPDATE
            SET payload    = EXCLUDED.payload,
                updated_at = NOW()
        `,
        params: [
          projectionName,
          account,
          JSON.stringify({ account, currency, amount, session }),
        ],
      };
    },

    FundsWithdrawn: (payload, { projectionName }) => ({
      sql: `DELETE FROM projections WHERE name = $1 AND key = $2`,
      params: [projectionName, (payload as WithAccountPayload).account],
    }),
  },
};
