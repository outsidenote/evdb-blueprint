import { test, describe, before, after, beforeEach } from "node:test";
import * as assert from "node:assert";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { TestDatabase } from "../../tests/harness/index.js";
import { type ProjectionConfig } from "../projections/ProjectionFactory.js";
import { applyProjectionEvent } from "../projections/projectionUtils.js";
import { type EventMeta } from "../endpoints/kafkaConsumerUtils.js";

export type ProjectionSliceTestCase = {
  description: string;
  /**
   * Returns fresh data on each call.
   * `meta` is optional and defaults to a random outboxId and current timestamp
   * when not relevant to the test.
   */
  run: () => {
    given: Array<{ messageType: string; payload: Record<string, unknown>; meta?: Partial<EventMeta> }>;
    then: Array<{ key: string; expectedState: Record<string, unknown> | null }>;
  };
};

export class ProjectionSliceTester {
  static run(slice: ProjectionConfig, cases: ProjectionSliceTestCase[]): void {
    const db = new TestDatabase();
    let pool: Pool;

    before(async () => {
      await db.start();
      pool = new Pool({ connectionString: db.connectionUri });
    });

    after(async () => {
      await pool.end();
      await db.stop();
    });

    describe(`Projection: ${slice.projectionName}`, () => {
      beforeEach(async () => {
        await pool.query("TRUNCATE projections, projection_idempotency");
      });

      for (const { description, run } of cases) {
        test(description, async () => {
          const { given, then } = run();

          for (const { messageType, payload, meta } of given) {
            await applyProjectionEvent(pool, slice, messageType, payload, {
              outboxId: meta?.outboxId ?? randomUUID(),
              storedAt: meta?.storedAt ?? new Date(),
            });
          }

          const keys = then.map((t) => t.key);
          assert.strictEqual(keys.length, new Set(keys).size, `duplicate keys in then: ${keys.join(", ")}`);
          const { rows } = await pool.query(
            `SELECT key, payload FROM projections WHERE name = $1 AND key = ANY($2)`,
            [slice.projectionName, keys],
          );
          const resultMap = new Map(rows.map((r) => [r.key as string, r.payload as Record<string, unknown>]));

          for (const { key, expectedState } of then) {
            const state = resultMap.get(key) ?? null;
            assert.deepStrictEqual(state, expectedState, `key: ${key}`);
          }
        });
      }
    });
  }
}
