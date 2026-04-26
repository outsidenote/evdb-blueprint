import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { accountViewSlice } from "./index.js";

ProjectionSliceTester.run(accountViewSlice, [
  {
    description: "Accountcreated: first event creates initial state",
    run: () => {
      // TODO: create test data and fill expected state
      // The payload should contain the fields from the Accountcreated event,
      // NOT the readmodel fields. Check the event schema in TODO_CONTEXT.md.
      // Key should match how the projection handler builds it.
      const key = randomUUID();
      return {
        given: [
          { messageType: "Accountcreated", payload: {
            // TODO: fill with Accountcreated event fields
          } },
        ],
        then: [{ key, expectedState: {
          // TODO: expected stored state after first event
        } }],
      };
    },
  },
]);
