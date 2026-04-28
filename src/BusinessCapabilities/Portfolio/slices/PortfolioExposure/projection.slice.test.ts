import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioExposureSlice } from "./index.js";

ProjectionSliceTester.run(portfolioExposureSlice, [
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
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      // Spec: Aggregates loan exposure by credit rating within each portfolio. Key: {portfolioId}:{creditRating}.

Each LoanRiskAssess...
      // TODO: send two events with DIFFERENT numeric values,
      // then assert the accumulated/averaged result.
      const key = randomUUID();
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            // TODO: first event payload
          } },
          { messageType: "LoanRiskAssessed", payload: {
            // TODO: second event payload (different numbers)
          } },
        ],
        then: [{ key, expectedState: {
          // TODO: expected accumulated state after two events
        } }],
      };
    },
  },
]);
