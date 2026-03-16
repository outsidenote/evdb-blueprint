import type { ProjectionConfig } from "../../../../types/ProjectionFactory.js";
import { ProjectionModeType } from "../../../../types/ProjectionFactory.js";

type FundsWithdrawalApprovedPayload = {
  account: string;
  currency: string;
  amount: number;
  transactionId: string;
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
 *   2. Set `mode` to the appropriate execution strategy.
 *   3. Define one handler per message type that should update the read model.
 *   4. Use `meta.projectionName` in SQL params — never hardcode the name.
 *   5. Return null from a handler to ignore a message type.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const pendingWithdrawalLookupSlice: ProjectionConfig = {
  projectionName: "PendingWithdrawalLookup",

  mode: { type: ProjectionModeType.Query },

  handlers: {
    FundsWithdrawalApproved: (payload, { projectionName }) => {
      const { account, currency, amount, transactionId } = payload as FundsWithdrawalApprovedPayload;
      return [
        {
          sql: `
            INSERT INTO projections (name, key, payload)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (name, key) DO UPDATE
              SET payload    = EXCLUDED.payload`,
          params: [
            projectionName,
            account,
            JSON.stringify({ account, currency, amount, transactionId }),
          ],
        },
      ];
    },

    FundsWithdrawn: (payload, { projectionName }) => [
      {
        sql: `DELETE FROM projections WHERE name = $1 AND key = $2`,
        params: [projectionName, (payload as WithAccountPayload).account],
      },
    ],
  },
};
