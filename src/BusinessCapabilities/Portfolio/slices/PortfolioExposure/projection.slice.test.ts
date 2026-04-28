import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioExposureSlice } from "./index.js";

// ── How values round-trip through jsonb (READ THIS BEFORE WRITING ASSERTIONS) ──
// The projection's UPSERT writes via jsonb_build_object('field', $N::CAST), and the
// test reads back the payload column. Values come back according to the cast used:
//
//   ::numeric / ::int / ::bigint  → JS number      (use 10000, not "10000")
//   ::text / ::uuid               → JS string      (use "PORT-001", not new String(...))
//   ::boolean                     → JS boolean     (true / false)
//   ::text (for dates)            → JS string      (ISO format, e.g. "2024-01-15T10:30:00.000Z")
//
// Dates: pass `.toISOString()` strings into payload AND expectedState. Don't use
// `new Date(...)` in expectedState — node-postgres returns them as strings, not Date objects.

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
          // Numbers as JS numbers (10000, not "10000")
          // Dates as ISO strings ("2024-01-15T10:30:00.000Z", not new Date(...))
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
