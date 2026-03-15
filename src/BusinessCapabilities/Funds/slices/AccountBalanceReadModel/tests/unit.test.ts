import { test, describe } from "node:test";
import { ProjectionTester } from "../../../../../types/ProjectionTester.js";
import { accountBalanceReadModelSlice } from "../index.js";

describe("AccountBalanceReadModel projection slice - unit", () => {

  test("FundsDepositApproved: increases balance by amount", () => {
    ProjectionTester.testIdempotent(
      accountBalanceReadModelSlice,
      "FundsDepositApproved",
      { account: "acc-1", amount: 500, currency: "USD", transactionId: "txn-001" },
      {
        idempotencyKey: "txn-001",
        sqlContains: "INSERT INTO projections",
        params: [
          "AccountBalanceReadModel",
          "acc-1",
          { account: "acc-1", balance: 500, currency: "USD" },
          500,
          "USD",
        ],
      },
    );
  });

  test("FundsWithdrawn: decreases balance by (amount + commission)", () => {
    ProjectionTester.testIdempotent(
      accountBalanceReadModelSlice,
      "FundsWithdrawn",
      { account: "acc-1", amount: 100, commission: 1, currency: "USD", transactionId: "txn-002" },
      {
        idempotencyKey: "txn-002",
        sqlContains: "INSERT INTO projections",
        params: [
          "AccountBalanceReadModel",
          "acc-1",
          { account: "acc-1", balance: -101, currency: "USD" },
          -101,
          "USD",
        ],
      },
    );
  });

});
