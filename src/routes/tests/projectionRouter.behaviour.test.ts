import { test, describe, before, after, beforeEach } from "node:test";
import * as assert from "node:assert";
import express from "express";
import request from "supertest";
import { Pool } from "pg";
import { TestDatabase } from "../../tests/harness/index.js";
import { ProjectionRepository } from "../../types/ProjectionRepository.js";
import { createProjectionRouter } from "../projections.js";

/**
 * Behaviour tests for the projection query router.
 *
 * Full HTTP flow: supertest → Express → parser → ProjectionRepository → PostgreSQL.
 * Validates response envelopes, status codes, pagination, validation errors,
 * policy enforcement, and mutual exclusivity.
 */

const PROJECTION = "TestProjection";

describe("Projection Router — Behaviour Tests", () => {
  const db = new TestDatabase();
  let pool: Pool;
  let app: express.Express;

  async function seedRow(key: string, payload: Record<string, unknown>): Promise<void> {
    await pool.query(
      `INSERT INTO projections (name, key, payload) VALUES ($1, $2, $3::jsonb)`,
      [PROJECTION, key, JSON.stringify(payload)],
    );
  }

  function createApp(): express.Express {
    const repository = new ProjectionRepository(pool);
    const allowed = new Set([PROJECTION]);
    const silentLogger = { error: () => {} };
    const a = express();
    a.use(express.json());
    a.use("/api/projections", createProjectionRouter(repository, allowed, silentLogger));
    return a;
  }

  before(async () => {
    await db.start();
    pool = new Pool({ connectionString: db.connectionUri });
    app = createApp();
  });

  after(async () => {
    await pool.end();
    await db.stop();
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE projections");
  });

  // ── byKey: { item } envelope ──────────────────────────────────────────

  describe("GET ?key= (single key)", () => {
    test("returns { item } envelope with 200", async () => {
      await seedRow("acct-1", { balance: 100 });

      const res = await request(app).get(`/api/projections/${PROJECTION}?key=acct-1`);

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.item);
      assert.strictEqual(res.body.item.key, "acct-1");
      assert.deepStrictEqual(res.body.item.payload, { balance: 100 });
      assert.ok(res.body.item.updatedAt);
    });

    test("returns 404 for missing key", async () => {
      const res = await request(app).get(`/api/projections/${PROJECTION}?key=missing`);

      assert.strictEqual(res.status, 404);
      assert.ok(res.body.error.includes("missing"));
    });
  });


  describe("GET ?keys= (multiple keys)", () => {
    test("returns { items } envelope ordered by key", async () => {
      await seedRow("c", { v: 3 });
      await seedRow("a", { v: 1 });
      await seedRow("b", { v: 2 });

      const res = await request(app).get(`/api/projections/${PROJECTION}?keys=c,a,b`);

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.items));
      assert.deepStrictEqual(
        res.body.items.map((r: { key: string }) => r.key),
        ["a", "b", "c"],
      );
    });

    test("omits missing keys", async () => {
      await seedRow("a", { v: 1 });

      const res = await request(app).get(`/api/projections/${PROJECTION}?keys=a,missing`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.items.length, 1);
    });
  });


  describe("GET ?from=&to= (range search)", () => {
    test("returns items between from and to inclusive", async () => {
      await seedRow("a", { v: 1 });
      await seedRow("b", { v: 2 });
      await seedRow("c", { v: 3 });
      await seedRow("d", { v: 4 });

      const res = await request(app).get(`/api/projections/${PROJECTION}?from=b&to=c`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.items.length, 2);
      assert.deepStrictEqual(
        res.body.items.map((r: { key: string }) => r.key),
        ["b", "c"],
      );
    });

    test("pagination with afterKey", async () => {
      await seedRow("a", { v: 1 });
      await seedRow("b", { v: 2 });
      await seedRow("c", { v: 3 });

      const page1 = await request(app).get(`/api/projections/${PROJECTION}?from=a&to=z&limit=2`);
      assert.strictEqual(page1.body.items.length, 2);
      assert.strictEqual(page1.body.nextAfterKey, "b");

      const page2 = await request(app).get(`/api/projections/${PROJECTION}?from=a&to=z&limit=2&afterKey=b`);
      assert.strictEqual(page2.body.items.length, 1);
      assert.strictEqual(page2.body.nextAfterKey, undefined);
    });
  });


  describe("Validation (400 errors)", () => {
    test("no query params → 400", async () => {
      const res = await request(app).get(`/api/projections/${PROJECTION}`);
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.includes("Provide one of"));
    });

    test("mutually exclusive params → 400", async () => {
      const res = await request(app).get(`/api/projections/${PROJECTION}?key=a&from=x&to=z`);
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.includes("mutually exclusive"));
    });

    test("from without to → 400", async () => {
      const res = await request(app).get(`/api/projections/${PROJECTION}?from=a`);
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.includes("requires"));
    });

    test("unknown param → 400", async () => {
      const res = await request(app).get(`/api/projections/${PROJECTION}?key=a&foo=bar`);
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.includes("Unknown"));
    });

    test("limit on byKey → 400", async () => {
      const res = await request(app).get(`/api/projections/${PROJECTION}?key=a&limit=10`);
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.includes("not supported"));
    });

    test("invalid limit → 400", async () => {
      const res = await request(app).get(`/api/projections/${PROJECTION}?from=a&to=z&limit=abc`);
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.includes("positive integer"));
    });

    test("limit exceeds maxLimit → 400", async () => {
      const res = await request(app).get(`/api/projections/${PROJECTION}?from=a&to=z&limit=9999`);
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.includes("must not exceed"));
    });
  });

  // ── Unknown projection → 404 ─────────────────────────────────────────

  describe("Unknown projection", () => {
    test("returns 404 for unregistered projection", async () => {
      const res = await request(app).get("/api/projections/UnknownProjection?key=a");
      assert.strictEqual(res.status, 404);
      assert.ok(res.body.error.includes("Unknown projection"));
    });
  });

});
