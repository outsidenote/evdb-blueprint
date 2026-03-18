import { test, describe, before, after, beforeEach } from "node:test";
import * as assert from "node:assert";
import { Pool } from "pg";
import { TestDatabase } from "../../tests/harness/index.js";
import { ProjectionRepository } from "../ProjectionRepository.js";

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
    test("returns projections ordered by key", async () => {
      await seedRow(PROJECTION, "acct-3", { balance: 300 });
      await seedRow(PROJECTION, "acct-1", { balance: 100 });
      await seedRow(PROJECTION, "acct-2", { balance: 200 });

      const results = await repository.byKeys(PROJECTION, ["acct-3", "acct-1", "acct-2"]);

      assert.deepStrictEqual(
        results.map((r) => r.key),
        ["acct-1", "acct-2", "acct-3"],
      );
    });

    test("omits missing keys without error", async () => {
      await seedRow(PROJECTION, "acct-1", { balance: 100 });
      const results = await repository.byKeys(PROJECTION, ["acct-1", "acct-missing"]);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].key, "acct-1");
    });

    test("returns empty array for empty keys input", async () => {
      const results = await repository.byKeys(PROJECTION, []);
      assert.deepStrictEqual(results, []);
    });

    test("throws when keys exceed MAX_KEYS", async () => {
      const tooManyKeys = Array.from({ length: 101 }, (_, i) => `key-${i}`);
      await assert.rejects(
        () => repository.byKeys(PROJECTION, tooManyKeys),
        { message: `byKeys supports at most ${ProjectionRepository.MAX_KEYS} keys` },
      );
    });

    test("includes updatedAt in results", async () => {
      await seedRow(PROJECTION, "acct-1", { balance: 100 });
      const results = await repository.byKeys(PROJECTION, ["acct-1"]);
      assert.ok(results[0].updatedAt instanceof Date);
    });
  });

  // ── betweenKeys ───────────────────────────────────────────────────────

  describe("betweenKeys", () => {
    test("returns keys between from and to inclusive", async () => {
      await seedRow(PROJECTION, "a", { v: 1 });
      await seedRow(PROJECTION, "b", { v: 2 });
      await seedRow(PROJECTION, "c", { v: 3 });
      await seedRow(PROJECTION, "d", { v: 4 });

      const result = await repository.betweenKeys(PROJECTION, "b", "c");

      assert.strictEqual(result.rows.length, 2);
      assert.deepStrictEqual(
        result.rows.map((r) => r.key),
        ["b", "c"],
      );
      assert.strictEqual(result.hasMore, false);
    });

    test("returns results ordered by key", async () => {
      await seedRow(PROJECTION, "z", { v: 3 });
      await seedRow(PROJECTION, "a", { v: 1 });
      await seedRow(PROJECTION, "m", { v: 2 });

      const result = await repository.betweenKeys(PROJECTION, "a", "z");

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
