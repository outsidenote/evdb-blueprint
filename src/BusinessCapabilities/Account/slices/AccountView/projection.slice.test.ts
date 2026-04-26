import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { accountViewSlice } from "./index.js";

ProjectionSliceTester.run(accountViewSlice, [
  {
    description: "Accountcreated: first event creates initial state",
    run: () => {
      const accountId = randomUUID();
      const key = accountId; // projection key is accountId
      return {
        given: [
          { messageType: "Accountcreated", payload: {
            accountId,
            currency: "USD",
            name: "Test Account",
          } },
        ],
        then: [{ key, expectedState: {
          accountId,
          currency: "USD",
          name: "Test Account",
        } }],
      };
    },
  },
]);
