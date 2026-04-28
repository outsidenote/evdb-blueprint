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
      // key = `${portfolioId}:${creditRating}` as built by the handler
      const key = "PORT-01:AAA";
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId: "PORT-01",
            creditRating: "AAA",
            probabilityOfDefault: 0.05,
            loanAmount: 500000,
          } },
        ],
        then: [{ key, expectedState: {
          // First event: loanCount initialises to 1 (hardcoded in INSERT)
          // exposure = loanAmount = 500000
          // avgPD = probabilityOfDefault = 0.05 (no prior exposure, so just the loan's PD)
          creditRating: "AAA",
          portfolioId: "PORT-01",
          avgPD: 0.05,
          exposure: 500000,
          loanCount: 1,
        } }],
      };
    },
  },
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      // Event 1: probabilityOfDefault=0.02, loanAmount=300000
      // Event 2: probabilityOfDefault=0.08, loanAmount=700000
      //
      // loanCount: 1 + 1 = 2
      // exposure: 300000 + 700000 = 1000000
      // avgPD weighted average:
      //   = (prev_avgPD * prev_exposure + probabilityOfDefault * loanAmount) / (prev_exposure + loanAmount)
      //   = (0.02 * 300000 + 0.08 * 700000) / (300000 + 700000)
      //   = (6000 + 56000) / 1000000
      //   = 62000 / 1000000
      //   = 0.062
      const key = "PORT-01:BBB";
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId: "PORT-01",
            creditRating: "BBB",
            probabilityOfDefault: 0.02,
            loanAmount: 300000,
          } },
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId: "PORT-01",
            creditRating: "BBB",
            probabilityOfDefault: 0.08,
            loanAmount: 700000,
          } },
        ],
        then: [{ key, expectedState: {
          creditRating: "BBB",
          portfolioId: "PORT-01",
          // loanCount: 1 + 1 = 2
          loanCount: 2,
          // exposure: 300000 + 700000 = 1000000
          exposure: 1000000,
          // avgPD: (0.02 * 300000 + 0.08 * 700000) / (300000 + 700000) = 62000 / 1000000 = 0.062
          avgPD: 0.062,
        } }],
      };
    },
  },
]);
