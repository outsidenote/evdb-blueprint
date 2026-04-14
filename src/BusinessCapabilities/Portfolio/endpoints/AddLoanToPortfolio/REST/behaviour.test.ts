import * as assert from "node:assert";
import { test, describe } from "node:test";
import express from "express";
import request from "supertest";
import { routeConfig } from "#BusinessCapabilities/Portfolio/endpoints/routes.js";
import InMemoryStorageAdapter from "../../../../../tests/InMemoryStorageAdapter.js";

function createTestApp() {
  const adapter = new InMemoryStorageAdapter();
  const app = express();
  app.use(express.json());
  app.use(routeConfig.basePath, routeConfig.createRouter(adapter));
  return app;
}

describe("AddLoanToPortfolio — Behaviour Tests", () => {
  test("POST /api/portfolio/add-loan-to-portfolio with valid payload returns 200", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/api/portfolio/add-loan-to-portfolio")
      .send({
        portfolioId: "test-portfolioId-001",
        borrowerName: "test-borrowerName",
        creditRating: "test-creditRating",
        interestRate: 0,
        loanAmount: 0,
        maturityDate: new Date("2025-01-01T11:00:00Z"),
      });

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.streamId, "Response should include streamId");
    assert.ok(Array.isArray(res.body.emittedEventTypes), "Response should include emittedEventTypes");
  });

  test("POST /api/portfolio/add-loan-to-portfolio with missing required fields returns 400", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/api/portfolio/add-loan-to-portfolio")
      .send({
        borrowerName: "test-borrowerName",
        creditRating: "test-creditRating",
      });

    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error, "Response should include error message");
  });

});
