import type { ProjectionConfig } from "../../../../types/ProjectionFactory.js";

type FundsWithdrawnPayload = {
  account: string;
  amount: number;
  commission: number;
  currency: string;
  capturedAt: string;
};

/**
 * Projection slice: Account Balance Read Model
 *
 * Maintains a running balance per account. Balance decreases with each withdrawal
 * and can go negative.
 * Key: account UUID
 *
 * - FundsWithdrawn → accumulates delta (amount + commission) into running balance
 *
 * Uses SqlTransaction to atomically:
 *   1. Insert an idempotency key (outboxId) — guards against double-counting on replay.
 *   2. Update the snapshot balance — only applied if the idempotency key was new.
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
    FundsWithdrawn: (payload, { projectionName, outboxId }) => {
      const { account, amount, commission, currency } = payload as FundsWithdrawnPayload;
      const delta = -(amount + commission);

      return {
        statements: [
          // 1. Idempotency key — one row per processed event, keyed by outboxId.
          //    ON CONFLICT DO NOTHING makes replay a no-op.
          {
            sql: `
              INSERT INTO projections (name, key, payload)
              VALUES ($1, $2, $3::jsonb)
              ON CONFLICT (name, key) DO NOTHING
            `,
            params: [
              `${projectionName}:idempotency`,
              outboxId,
              JSON.stringify({ account, outboxId }),
            ],
          },
          // 2. Snapshot — accumulate delta into running balance.
          //    Only updates if the idempotency key above was freshly inserted.
          {
            sql: `
              INSERT INTO projections (name, key, payload)
              VALUES ($1, $2, $3::jsonb)
              ON CONFLICT (name, key) DO UPDATE
                SET payload = jsonb_set(
                  projections.payload,
                  '{balance}',
                  to_jsonb((projections.payload->>'balance')::numeric + $4::numeric)
                ),
                updated_at = NOW()
              WHERE NOT EXISTS (
                SELECT 1 FROM projections
                WHERE name = $5 AND key = $6
              )
            `,
            params: [
              projectionName,
              account,
              JSON.stringify({ account, balance: delta, currency }),
              delta,
              `${projectionName}:idempotency`,
              outboxId,
            ],
          },
        ],
      };
    },
  },
};
