import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { loanSubmissionStatusSlice } from "./index.js";

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

ProjectionSliceTester.run(loanSubmissionStatusSlice, [
  {
    description: "LoanAddedToPortfolio: first event creates initial state",
    run: () => {
      const portfolioId = randomUUID();
      const loanId = randomUUID();
      // maturityDate stored as ::text — must match exactly in expectedState
      const maturityDate = "2030-06-15T00:00:00.000Z";

      return {
        given: [
          {
            messageType: "LoanAddedToPortfolio",
            payload: {
              portfolioId,
              borrowerName: "Jane Smith",
              creditRating: "AA",
              interestRate: 4.5,
              loanAmount: 250000,
              loanId,
              maturityDate, // passed as ISO string; handler's instanceof Date guard passes it through
            },
          },
        ],
        then: [
          {
            key: portfolioId,
            expectedState: {
              // All string fields come back as JS strings (::text)
              borrowerName: "Jane Smith",
              creditRating: "AA",
              // interestRate: ::numeric → JS number
              interestRate: 4.5,
              // loanAmount: ::numeric → JS number
              loanAmount: 250000,
              loanId,
              // maturityDate: ::text → JS string (ISO)
              maturityDate,
              // LoanAddedToPortfolio stores empty errorMessage (loan was accepted)
              errorMessage: "",
            },
          },
        ],
      };
    },
  },
]);
