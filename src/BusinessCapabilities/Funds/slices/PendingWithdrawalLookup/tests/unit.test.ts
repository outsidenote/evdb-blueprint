import { test, describe } from "node:test";
import { ProjectionTester } from "../../../../../types/ProjectionTester.js";
import { pendingWithdrawalLookupSlice } from "../index.js";

describe("PendingWithdrawalLookup projection slice - unit", () => {

  test("FundsWithdrawalApproved: UPSERT with projection name, account key, and full payload", () => {
    ProjectionTester.test(
      pendingWithdrawalLookupSlice,
      "FundsWithdrawalApproved",
      { account: "acc-1", currency: "USD", amount: 150.5, session: "sess-abc" },
      {
        sqlContains: "INSERT INTO projections",
        params: [
          "PendingWithdrawalLookup",
          "acc-1",
          { account: "acc-1", currency: "USD", amount: 150.5, session: "sess-abc" },
        ],
      },
    );
  });

  test("FundsWithdrawn: DELETE keyed by projection name and account", () => {
    ProjectionTester.test(
      pendingWithdrawalLookupSlice,
      "FundsWithdrawn",
      { account: "acc-2" },
      {
        sqlContains: "DELETE FROM projections",
        params: ["PendingWithdrawalLookup", "acc-2"],
      },
    );
  });


});
