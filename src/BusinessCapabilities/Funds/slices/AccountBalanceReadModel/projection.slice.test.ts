import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "../../../../types/ProjectionSliceTester.js";
import { accountBalanceReadModelSlice } from "./index.js";

ProjectionSliceTester.run(accountBalanceReadModelSlice, [
  {
    description: "FundsDepositApproved: creates balance",
    run: () => {
      const account = randomUUID();
      const transactionId = randomUUID();
      return {
        given: [
          { messageType: "FundsDepositApproved", payload: { account, amount: 100, currency: "USD", transactionId } },
        ],
        then: [{ key: account, expectedState: { account, balance: 100, currency: "USD" } }],
      };
    },
  },
  {
    description: "multiple deposits: balance accumulates",
    run: () => {
      const account = randomUUID();
      return {
        given: [
          { messageType: "FundsDepositApproved", payload: { account, amount: 100, currency: "USD", transactionId: randomUUID() } },
          { messageType: "FundsDepositApproved", payload: { account, amount: 50, currency: "USD", transactionId: randomUUID() } },
        ],
        then: [{ key: account, expectedState: { account, balance: 150, currency: "USD" } }],
      };
    },
  },
  {
    description: "FundsWithdrawn: reduces balance by amount + commission",
    run: () => {
      const account = randomUUID();
      return {
        given: [
          { messageType: "FundsDepositApproved", payload: { account, amount: 200, currency: "USD", transactionId: randomUUID() } },
          { messageType: "FundsWithdrawn", payload: { account, amount: 50, commission: 5, currency: "USD", transactionId: randomUUID() } },
        ],
        then: [{ key: account, expectedState: { account, balance: 145, currency: "USD" } }],
      };
    },
  },
  {
    description: "multiple accounts: each withdrawal is tracked independently",
    run: () => {
      const account1 = randomUUID();
      const account2 = randomUUID();
      return {
        given: [
          { messageType: "FundsWithdrawn", payload: { account: account1, amount: 100, commission: 10, currency: "USD", transactionId: randomUUID() } },
          { messageType: "FundsWithdrawn", payload: { account: account2, amount: 50, commission: 5, currency: "USD", transactionId: randomUUID() } },
        ],
        then: [
          { key: account1, expectedState: { account: account1, balance: -110, currency: "USD" } },
          { key: account2, expectedState: { account: account2, balance: -55, currency: "USD" } },
        ],
      };
    },
  },
  {
    description: "idempotency: replaying same transactionId does not double-count",
    run: () => {
      const account = randomUUID();
      const transactionId = randomUUID();
      const payload = { account, amount: 100, currency: "USD", transactionId };
      return {
        given: [
          { messageType: "FundsDepositApproved", payload },
          { messageType: "FundsDepositApproved", payload }, // replay
        ],
        then: [{ key: account, expectedState: { account, balance: 100, currency: "USD" } }],
      };
    },
  },
]);
