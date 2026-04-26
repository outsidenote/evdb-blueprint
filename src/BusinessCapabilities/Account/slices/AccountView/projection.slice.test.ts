import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { accountViewSlice } from "./index.js";

ProjectionSliceTester.run(accountViewSlice, [
  {
    description: "AccountCreated: first event creates initial state",
    run: () => {
      const accountId = randomUUID();
      return {
        given: [
          { messageType: "AccountCreated", payload: {
            accountId,
            currency: "USD",
            name: "Test Account",
          } },
        ],
        then: [{ key: accountId, expectedState: {
          accountId,
          currency: "USD",
          name: "Test Account",
        } }],
      };
    },
  },
]);
