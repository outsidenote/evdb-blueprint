import type pg from "pg";

export interface IdempotencyGate {
  isAlreadyProcessed(idempotencyKey: string): Promise<boolean>;
}

/**
 * Checks the outbox table for an existing idempotency marker.
 *
 * The marker is written atomically with the events by the stream's
 * message handler — not by the factory. This class is the gate only.
 */
export class OutboxIdempotencyGate implements IdempotencyGate {
  constructor(private readonly pool: pg.Pool) {}

  async isAlreadyProcessed(idempotencyKey: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM public.outbox WHERE channel = 'idempotent' AND payload->>'idempotencyKey' = $1 LIMIT 1`,
      [idempotencyKey],
    );
    return rows.length > 0;
  }
}
