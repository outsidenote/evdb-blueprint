import { test, describe, before, after } from "node:test";
import * as assert from "node:assert";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { TestDatabase } from "../tests/harness/index.js";
import { type ProjectionConfig } from "./ProjectionFactory.js";
import { applyProjectionEvent } from "./projectionUtils.js";

export type ProjectionSliceTestCase = {
  description: string;
  /**
   * Returns fresh random data on each call so tests are isolated.
   * `given` is the sequence of events to apply.
   * `then` is the expected projection state for the given key (null = row deleted).
   */
  run: () => {
    given: Array<{ messageType: string; payload: Record<string, unknown> }>;
    then: { key: string; expectedState: Record<string, unknown> | null };
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
      for (const { description, run } of cases) {
        test(description, async () => {
          const { given, then } = run();

          for (const { messageType, payload } of given) {
            await applyProjectionEvent(pool, slice, messageType, payload, { outboxId: randomUUID(), storedAt: new Date() });
          }

          const { rows } = await pool.query(
            `SELECT payload FROM projections WHERE name = $1 AND key = $2`,
            [slice.projectionName, then.key],
          );
          const state = rows.length > 0 ? (rows[0].payload as Record<string, unknown>) : null;
          assert.deepStrictEqual(state, then.expectedState);
        });
      }
    });
  }
}
