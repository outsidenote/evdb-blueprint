import * as assert from "node:assert";
import { test, describe } from "node:test";
import express from "express";
import request from "supertest";
import { routeConfig } from "#BusinessCapabilities/Account/endpoints/routes.js";
import InMemoryStorageAdapter from "../../../../../tests/InMemoryStorageAdapter.js";

function createTestApp() {
  const adapter = new InMemoryStorageAdapter();
  const app = express();
  app.use(express.json());
  app.use(routeConfig.basePath, routeConfig.createRouter(adapter));
  return app;
}

describe("CreateAccount — Behaviour Tests", () => {
  test("POST /api/account/create-account with valid payload returns 200", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/api/account/create-account")
      .send({
        currency: "test-currency",
        name: "test-name",
      });

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.streamId, "Response should include streamId");
    assert.ok(Array.isArray(res.body.emittedEventTypes), "Response should include emittedEventTypes");
  });

  test("POST /api/account/create-account with missing required fields returns 400", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/api/account/create-account")
      .send({
        name: "test-name",
      });

    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error, "Response should include error message");
  });

});
