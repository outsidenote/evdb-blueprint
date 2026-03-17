import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "../../../../types/ProjectionSliceTester.js";
import { pendingWithdrawalLookupSlice } from "./index.js";

ProjectionSliceTester.run(pendingWithdrawalLookupSlice, [
  {
    description: "FundsWithdrawalApproved: creates pending entry",
    run: () => {
      const account = randomUUID();
      const transactionId = randomUUID();
      return {
        given: [
          { messageType: "FundsWithdrawalApproved", payload: { account, currency: "USD", amount: 75, transactionId } },
        ],
        then: [{ key: account, expectedState: { account, currency: "USD", amount: 75, transactionId } }],
      };
    },
  },
  {
    description: "FundsWithdrawalApproved (replay): updates row, no duplicate",
    run: () => {
      const account = randomUUID();
      const secondTransactionId = randomUUID();
      return {
        given: [
          { messageType: "FundsWithdrawalApproved", payload: { account, currency: "USD", amount: 100, transactionId: randomUUID() } },
          { messageType: "FundsWithdrawalApproved", payload: { account, currency: "EUR", amount: 200, transactionId: secondTransactionId } },
        ],
        then: [{ key: account, expectedState: { account, currency: "EUR", amount: 200, transactionId: secondTransactionId } }],
      };
    },
  },
  {
    description: "FundsWithdrawn: removes pending entry",
    run: () => {
      const account = randomUUID();
      return {
        given: [
          { messageType: "FundsWithdrawalApproved", payload: { account, currency: "USD", amount: 75, transactionId: randomUUID() } },
          { messageType: "FundsWithdrawn", payload: { account } },
        ],
        then: [{ key: account, expectedState: null }],
      };
    },
  },
]);
