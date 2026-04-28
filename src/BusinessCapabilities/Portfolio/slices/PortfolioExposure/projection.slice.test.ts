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
      // Key: portfolioId:creditRating
      const key = "PORT-01:AAA";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-01",
              creditRating: "AAA",
              loanAmount: 1000000,
              probabilityOfDefault: 0.05,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId: "PORT-01",
              creditRating: "AAA",
              // First event: avgPD = probabilityOfDefault = 0.05
              avgPD: 0.05,
              // First event: exposure = loanAmount = 1000000
              exposure: 1000000,
              // First event: loanCount initialised to 1
              loanCount: 1,
            },
          },
        ],
      };
    },
  },
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      // Event 1: loanAmount=1000000, probabilityOfDefault=0.10
      // Event 2: loanAmount=1000000, probabilityOfDefault=0.20
      //
      // After both events:
      //   loanCount = 1 + 1 = 2
      //   exposure  = 1000000 + 1000000 = 2000000
      //   avgPD     = (0.10 * 1000000 + 0.20 * 1000000) / (1000000 + 1000000)
      //             = (100000 + 200000) / 2000000
      //             = 300000 / 2000000
      //             = 0.15
      const key = "PORT-01:AAA";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-01",
              creditRating: "AAA",
              loanAmount: 1000000,
              probabilityOfDefault: 0.10,
            },
          },
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-01",
              creditRating: "AAA",
              loanAmount: 1000000,
              probabilityOfDefault: 0.20,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId: "PORT-01",
              creditRating: "AAA",
              // avgPD: (0.10 * 1000000 + 0.20 * 1000000) / (1000000 + 1000000) = 0.15
              avgPD: 0.15,
              // exposure: 1000000 + 1000000 = 2000000
              exposure: 2000000,
              // loanCount: 1 + 1 = 2
              loanCount: 2,
            },
          },
        ],
      };
    },
  },
]);
