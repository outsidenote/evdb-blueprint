import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioLoanDetailsSlice } from "../index.js";

ProjectionSliceTester.run(portfolioLoanDetailsSlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      // TODO: create test data and fill expected state
      // The payload should contain the fields from the LoanRiskAssessed event,
      // NOT the readmodel fields. Check the event schema in TODO_CONTEXT.md.
      // Key should match how the projection handler builds it.
      const key = randomUUID();
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            // TODO: fill with LoanRiskAssessed event fields
          } },
        ],
        then: [{ key, expectedState: {
          // TODO: expected stored state after first event
        } }],
      };
    },
  },
]);
