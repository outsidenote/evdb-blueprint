import { test, describe } from "node:test";
import { ProjectionTester } from "../../../../../types/ProjectionTester.js";
import { accountBalanceReadModelSlice } from "../index.js";

describe("AccountBalanceReadModel projection slice - unit", () => {

  test("FundsDepositApproved: increases balance by amount", () => {
    ProjectionTester.test(
      accountBalanceReadModelSlice,
      "FundsDepositApproved",
      { account: "acc-1", amount: 500, currency: "USD", transactionId: "txn-001" },
      {
        sqlContains: "projection_idempotency",
        params: [
          "AccountBalanceReadModel",
          "txn-001",
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
    ProjectionTester.test(
      accountBalanceReadModelSlice,
      "FundsWithdrawn",
      { account: "acc-1", amount: 100, commission: 1, currency: "USD", transactionId: "txn-002" },
      {
        sqlContains: "projection_idempotency",
        params: [
          "AccountBalanceReadModel",
          "txn-002",
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
