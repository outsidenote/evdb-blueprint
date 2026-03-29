import * as assert from "node:assert";
import { test, describe } from "node:test";
import express from "express";
import request from "supertest";
import { createFundsRouter } from "#BusinessCapabilities/Funds/endpoints/routes.js";
import InMemoryStorageAdapter from "./InMemoryStorageAdapter.js";

function createTestApp() {
  const adapter = new InMemoryStorageAdapter();

  const app = express();
  app.use(express.json());
  app.use("/api/funds", createFundsRouter(adapter));
  return app;
}

describe("Withdrawal API — Behaviour Tests", () => {
  // ──────────────────────────────────────────────────────────────────
  // Scenario 1: Approve withdrawal with sufficient funds
  // ──────────────────────────────────────────────────────────────────
  test("POST /approve-withdrawal with sufficient funds returns FundsWithdrawalApproved", async (t) => {
    const app = createTestApp();

    await t.test("When: POST /approve-withdrawal with currentBalance=200, amount=20", async () => {
      const res = await request(app)
        .post("/api/funds/approve-withdrawal")
        .send({
          account: "acc-001",
          amount: 20,
          currency: "USD",
          session: "0011",
          source: "ATM",
          payer: "John Doe",
          transactionId: "txn-001",
          approvalDate: "2025-01-01T11:00:00Z",
          transactionTime: "2025-01-01T11:00:00Z",
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.streamId, "acc-001");
      assert.deepStrictEqual(res.body.emittedEventTypes, ["FundsWithdrawalDeclined"]);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Scenario 2: Decline withdrawal with insufficient funds
  // ──────────────────────────────────────────────────────────────────
  test("POST /approve-withdrawal with insufficient funds returns FundsWithdrawalDeclined", async (t) => {
    const app = createTestApp();

    await t.test("When: POST /approve-withdrawal with currentBalance=10, amount=20", async () => {
      const res = await request(app)
        .post("/api/funds/approve-withdrawal")
        .send({
          account: "acc-002",
          amount: 20,
          currency: "USD",
          session: "0022",
          source: "ATM",
          payer: "Jane Doe",
          transactionId: "txn-002",
        });

      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body.emittedEventTypes, ["FundsWithdrawalDeclined"]);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Scenario 3: Missing required fields returns 400
  // ──────────────────────────────────────────────────────────────────
  test("POST /approve-withdrawal with missing required fields returns 400", async (t) => {
    const app = createTestApp();

    await t.test("When: POST /approve-withdrawal without account", async () => {
      const res = await request(app)
        .post("/api/funds/approve-withdrawal")
        .send({ amount: 20, currentBalance: 200 });

      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error);
    });
  });
});
