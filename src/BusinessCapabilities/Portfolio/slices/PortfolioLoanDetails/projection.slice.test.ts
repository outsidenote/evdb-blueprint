import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioLoanDetailsSlice } from "./index.js";

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

ProjectionSliceTester.run(portfolioLoanDetailsSlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = "PORT-001";
      const loanId = "LOAN-001";
      // Dates passed as ISO strings — handler's `instanceof Date` guard passes them through
      const acquisitionDate = "2024-01-15T10:30:00.000Z";
      const maturityDate = "2030-06-30T00:00:00.000Z";

      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanId,
              acquisitionDate,
              borrowerName: "Acme Corp",
              capitalRequirement: 5000,
              creditRating: "BBB",
              expectedLoss: 250,
              interestRate: 0.05,
              loanAmount: 100000,
              maturityDate,
              probabilityOfDefault: 0.02,
              riskBand: "Medium",
              expectedPortfolioLoss: 2500,
              riskNarrative: "Moderate credit risk with stable outlook",
              simulatedDefaultRate: 0.015,
              tailRiskLoss: 10000,
              worstCaseLoss: 15000,
            },
          },
        ],
        then: [
          {
            // Key matches the composite key built by the handler: `${portfolioId}:${loanId}`
            key: `${portfolioId}:${loanId}`,
            expectedState: {
              portfolioId: "PORT-001",
              loanId: "LOAN-001",
              // ::text → JS string
              acquisitionDate: "2024-01-15T10:30:00.000Z",
              borrowerName: "Acme Corp",
              // ::numeric → JS number
              capitalRequirement: 5000,
              creditRating: "BBB",
              expectedLoss: 250,
              interestRate: 0.05,
              loanAmount: 100000,
              // ::text → JS string
              maturityDate: "2030-06-30T00:00:00.000Z",
              probabilityOfDefault: 0.02,
              riskBand: "Medium",
              expectedPortfolioLoss: 2500,
              riskNarrative: "Moderate credit risk with stable outlook",
              simulatedDefaultRate: 0.015,
              tailRiskLoss: 10000,
              worstCaseLoss: 15000,
            },
          },
        ],
      };
    },
  },
]);
