import { test, describe, before, after, beforeEach } from "node:test";
import * as assert from "node:assert";
import { Pool } from "pg";
import { TestDatabase } from "../../../tests/harness/index.js";
import { ProjectionRepository, collectByKeys } from "./ProjectionRepository.js";

/**
 * Integration tests for ProjectionRepository.
 *
 * Uses a real PostgreSQL testcontainer with the projections table.
 * Tests all three query modes: byKey, byKeys, betweenKeys.
 * Covers cursor-based pagination, updatedAt, input validation,
 * and the Queryable interface (Pool + PoolClient).
 */
describe("ProjectionRepository", () => {
  const db = new TestDatabase();
  let pool: Pool;
  let repository: ProjectionRepository;

  const PROJECTION = "TestProjection";

  async function seedRow(name: string, key: string, payload: Record<string, unknown>): Promise<void> {
    await pool.query(
      `INSERT INTO projections (name, key, payload) VALUES ($1, $2, $3::jsonb)`,
      [name, key, JSON.stringify(payload)],
    );
  }

  before(async () => {
    await db.start();
    pool = new Pool({ connectionString: db.connectionUri });
    repository = new ProjectionRepository(pool);
  });

  after(async () => {
    await pool.end();
    await db.stop();
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE projections");
  });

  // ── byKey ───────────────────────────────────────────────────────────────

  describe("byKey", () => {
    test("returns projection with updatedAt for existing key", async () => {
      await seedRow(PROJECTION, "acct-1", { balance: 100 });

      const result = await repository.byKey(PROJECTION, "acct-1");

      assert.ok(result);
      assert.strictEqual(result.key, "acct-1");
      assert.deepStrictEqual(result.payload, { balance: 100 });
      assert.ok(result.updatedAt instanceof Date);
    });

    test("returns null for non-existing key", async () => {
      const result = await repository.byKey(PROJECTION, "does-not-exist");
      assert.strictEqual(result, null);
    });

    test("does not return rows from a different projection", async () => {
      await seedRow("OtherProjection", "acct-1", { balance: 50 });
      const result = await repository.byKey(PROJECTION, "acct-1");
      assert.strictEqual(result, null);
    });

    test("throws on empty projectionName", async () => {
      await assert.rejects(
        () => repository.byKey("", "acct-1"),
        { message: "projectionName must not be empty" },
      );
    });

    test("throws on empty key", async () => {
      await assert.rejects(
        () => repository.byKey(PROJECTION, ""),
        { message: "key must not be empty" },
      );
    });
  });

  // ── byKeys ──────────────────────────────────────────────────────────────

  describe("byKeys", () => {
    test("yields batch with results ordered by key", async () => {
      await seedRow(PROJECTION, "acct-3", { balance: 300 });
      await seedRow(PROJECTION, "acct-1", { balance: 100 });
      await seedRow(PROJECTION, "acct-2", { balance: 200 });

      const all = await collectByKeys(repository, PROJECTION, ["acct-3", "acct-1", "acct-2"]);

      assert.deepStrictEqual(
        all.map((r) => r.key),
        ["acct-1", "acct-2", "acct-3"],
      );
    });

    test("omits missing keys without error", async () => {
      await seedRow(PROJECTION, "acct-1", { balance: 100 });
      const all = await collectByKeys(repository, PROJECTION, ["acct-1", "acct-missing"]);
      assert.strictEqual(all.length, 1);
      assert.strictEqual(all[0].key, "acct-1");
    });

    test("yields nothing for empty iterable", async () => {
      const all = await collectByKeys(repository, PROJECTION, []);
      assert.deepStrictEqual(all, []);
    });

    test("includes updatedAt in results", async () => {
      await seedRow(PROJECTION, "acct-1", { balance: 100 });
      const all = await collectByKeys(repository, PROJECTION, ["acct-1"]);
      assert.ok(all[0].updatedAt instanceof Date);
    });

    test("accepts a Set as input", async () => {
      await seedRow(PROJECTION, "a", { v: 1 });
      await seedRow(PROJECTION, "b", { v: 2 });

      const all = await collectByKeys(repository, PROJECTION, new Set(["b", "a"]));
      assert.strictEqual(all.length, 2);
      assert.deepStrictEqual(all.map((r) => r.key), ["a", "b"]);
    });

    test("accepts a generator as input", async () => {
      await seedRow(PROJECTION, "x", { v: 1 });
      await seedRow(PROJECTION, "y", { v: 2 });

      function* keyGen() {
        yield "x";
        yield "y";
      }

      const all = await collectByKeys(repository, PROJECTION, keyGen());
      assert.strictEqual(all.length, 2);
    });

    test("batches large key sets across multiple queries", async () => {
      // Seed BATCH_SIZE + 1 rows
      const count = ProjectionRepository.BATCH_SIZE + 1;
      for (let i = 0; i < count; i++) {
        await seedRow(PROJECTION, `key-${String(i).padStart(4, "0")}`, { i });
      }

      const keys = Array.from({ length: count }, (_, i) => `key-${String(i).padStart(4, "0")}`);
      const batches: number[] = [];
      for await (const batch of repository.byKeys(PROJECTION, keys)) {
        batches.push(batch.length);
      }

      assert.strictEqual(batches.length, 2);
      assert.strictEqual(batches[0], ProjectionRepository.BATCH_SIZE);
      assert.strictEqual(batches[1], 1);
    });
  });

  // ── betweenKeys ───────────────────────────────────────────────────────

  describe("betweenKeys", () => {
    test("default bounds [from, to) — inclusive start, exclusive end", async () => {
      await seedRow(PROJECTION, "a", { v: 1 });
      await seedRow(PROJECTION, "b", { v: 2 });
      await seedRow(PROJECTION, "c", { v: 3 });
      await seedRow(PROJECTION, "d", { v: 4 });

      const result = await repository.betweenKeys(PROJECTION, "b", "d");

      assert.deepStrictEqual(
        result.rows.map((r) => r.key),
        ["b", "c"],
      );
    });

    test("both inclusive [from, to]", async () => {
      await seedRow(PROJECTION, "a", { v: 1 });
      await seedRow(PROJECTION, "b", { v: 2 });
      await seedRow(PROJECTION, "c", { v: 3 });

      const result = await repository.betweenKeys(PROJECTION, "a", "c", { toInclusive: true });

      assert.deepStrictEqual(
        result.rows.map((r) => r.key),
        ["a", "b", "c"],
      );
    });

    test("both exclusive (from, to)", async () => {
      await seedRow(PROJECTION, "a", { v: 1 });
      await seedRow(PROJECTION, "b", { v: 2 });
      await seedRow(PROJECTION, "c", { v: 3 });
      await seedRow(PROJECTION, "d", { v: 4 });

      const result = await repository.betweenKeys(PROJECTION, "a", "d", { fromInclusive: false, toInclusive: false });

      assert.deepStrictEqual(
        result.rows.map((r) => r.key),
        ["b", "c"],
      );
    });

    test("exclusive start, inclusive end (from, to]", async () => {
      await seedRow(PROJECTION, "a", { v: 1 });
      await seedRow(PROJECTION, "b", { v: 2 });
      await seedRow(PROJECTION, "c", { v: 3 });

      const result = await repository.betweenKeys(PROJECTION, "a", "c", { fromInclusive: false, toInclusive: true });

      assert.deepStrictEqual(
        result.rows.map((r) => r.key),
        ["b", "c"],
      );
    });

    test("returns results ordered by key", async () => {
      await seedRow(PROJECTION, "z", { v: 3 });
      await seedRow(PROJECTION, "a", { v: 1 });
      await seedRow(PROJECTION, "m", { v: 2 });

      const result = await repository.betweenKeys(PROJECTION, "a", "z", { toInclusive: true });

      assert.deepStrictEqual(
        result.rows.map((r) => r.key),
        ["a", "m", "z"],
      );
    });

    test("paginates with limit and hasMore", async () => {
      await seedRow(PROJECTION, "a", { v: 1 });
      await seedRow(PROJECTION, "b", { v: 2 });
      await seedRow(PROJECTION, "c", { v: 3 });

      const page1 = await repository.betweenKeys(PROJECTION, "a", "z", { limit: 2 });
      assert.strictEqual(page1.rows.length, 2);
      assert.strictEqual(page1.hasMore, true);
    });

    test("paginates with afterKey cursor", async () => {
      await seedRow(PROJECTION, "a", { v: 1 });
      await seedRow(PROJECTION, "b", { v: 2 });
      await seedRow(PROJECTION, "c", { v: 3 });

      const page2 = await repository.betweenKeys(PROJECTION, "a", "z", { limit: 2, afterKey: "a" });
      assert.strictEqual(page2.rows.length, 2);
      assert.strictEqual(page2.hasMore, false);
      assert.deepStrictEqual(
        page2.rows.map((r) => r.key),
        ["b", "c"],
      );
    });

    test("afterKey respects toInclusive", async () => {
      await seedRow(PROJECTION, "a", { v: 1 });
      await seedRow(PROJECTION, "b", { v: 2 });
      await seedRow(PROJECTION, "c", { v: 3 });

      const result = await repository.betweenKeys(PROJECTION, "a", "c", { afterKey: "a", toInclusive: true });
      assert.deepStrictEqual(
        result.rows.map((r) => r.key),
        ["b", "c"],
      );
    });

    test("throws on empty from", async () => {
      await assert.rejects(
        () => repository.betweenKeys(PROJECTION, "", "z"),
        { message: "from must not be empty" },
      );
    });

    test("throws on empty to", async () => {
      await assert.rejects(
        () => repository.betweenKeys(PROJECTION, "a", ""),
        { message: "to must not be empty" },
      );
    });
  });

  // ── Queryable (PoolClient) ────────────────────────────────────────────

  describe("Queryable interface", () => {
    test("works with PoolClient inside a transaction", async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const txRepo = new ProjectionRepository(client);

        await client.query(
          `INSERT INTO projections (name, key, payload) VALUES ($1, $2, $3::jsonb)`,
          [PROJECTION, "tx-key", JSON.stringify({ fromTx: true })],
        );

        const result = await txRepo.byKey(PROJECTION, "tx-key");
        assert.ok(result);
        assert.deepStrictEqual(result.payload, { fromTx: true });

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }

      const result = await repository.byKey(PROJECTION, "tx-key");
      assert.strictEqual(result, null);
    });
  });
});
