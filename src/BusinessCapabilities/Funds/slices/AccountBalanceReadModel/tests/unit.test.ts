import { test, describe } from "node:test";
import { ProjectionTester } from "../../../../../types/ProjectionTester.js";
import { accountBalanceReadModelSlice } from "../index.js";

describe("AccountBalanceReadModel projection slice - unit", () => {

  test("FundsWithdrawn: UPSERT with projection name, account key, and balance payload", () => {
    ProjectionTester.test(
      accountBalanceReadModelSlice,
      "FundsWithdrawn",
      {
        account: "acc-1",
        amount: 189,
        currency: "USD",
        capturedAt: "2025-01-01T10:00:00.000Z",
      },
      {
        sqlContains: "INSERT INTO projections",
        params: [
          "AccountBalanceReadModel",
          "acc-1",
          {
            funds: 189,
            account: "acc-1",
            processedAt: "2025-01-01T10:00:00.000Z",
            currency: "USD",
          },
        ],
      },
    );
  });

});
