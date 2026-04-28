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
      const key = `${portfolioId}:${loanId}`;

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
              capitalRequirement: 50000,
              creditRating: "BBB",
              expectedLoss: 2500,
              interestRate: 0.05,
              loanAmount: 500000,
              maturityDate,
              probabilityOfDefault: 0.05,
              riskBand: "Medium",
              expectedPortfolioLoss: 12500,
              riskNarrative: "Moderate risk based on current market conditions",
              simulatedDefaultRate: 0.04,
              tailRiskLoss: 75000,
              worstCaseLoss: 100000,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId: "PORT-001",
              loanId: "LOAN-001",
              // Dates stored as ::text and returned as ISO strings
              acquisitionDate: "2024-01-15T10:30:00.000Z",
              borrowerName: "Acme Corp",
              // Numerics stored as ::numeric and returned as JS numbers
              capitalRequirement: 50000,
              creditRating: "BBB",
              expectedLoss: 2500,
              interestRate: 0.05,
              loanAmount: 500000,
              maturityDate: "2030-06-30T00:00:00.000Z",
              probabilityOfDefault: 0.05,
              riskBand: "Medium",
              expectedPortfolioLoss: 12500,
              riskNarrative: "Moderate risk based on current market conditions",
              simulatedDefaultRate: 0.04,
              tailRiskLoss: 75000,
              worstCaseLoss: 100000,
            },
          },
        ],
      };
    },
  },
  {
    description: "LoanRiskAssessed: second event for same loan overwrites previous state",
    run: () => {
      const portfolioId = "PORT-002";
      const loanId = "LOAN-002";
      const key = `${portfolioId}:${loanId}`;

      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanId,
              acquisitionDate: "2023-06-01T00:00:00.000Z",
              borrowerName: "Beta LLC",
              capitalRequirement: 30000,
              creditRating: "A",
              expectedLoss: 900,
              interestRate: 0.03,
              loanAmount: 300000,
              maturityDate: "2028-06-01T00:00:00.000Z",
              probabilityOfDefault: 0.03,
              riskBand: "Low",
              expectedPortfolioLoss: 4500,
              riskNarrative: "Low risk borrower with strong financials",
              simulatedDefaultRate: 0.02,
              tailRiskLoss: 30000,
              worstCaseLoss: 45000,
            },
          },
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanId,
              acquisitionDate: "2023-06-01T00:00:00.000Z",
              borrowerName: "Beta LLC",
              // Updated risk assessment — all values overwritten, not accumulated
              capitalRequirement: 35000,
              creditRating: "BBB",
              expectedLoss: 1750,
              interestRate: 0.035,
              loanAmount: 300000,
              maturityDate: "2028-06-01T00:00:00.000Z",
              probabilityOfDefault: 0.05,
              riskBand: "Medium",
              expectedPortfolioLoss: 8750,
              riskNarrative: "Risk upgraded due to sector headwinds",
              simulatedDefaultRate: 0.04,
              tailRiskLoss: 45000,
              worstCaseLoss: 60000,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId: "PORT-002",
              loanId: "LOAN-002",
              acquisitionDate: "2023-06-01T00:00:00.000Z",
              borrowerName: "Beta LLC",
              // Second event values — overwrite semantics
              capitalRequirement: 35000,
              creditRating: "BBB",
              expectedLoss: 1750,
              interestRate: 0.035,
              loanAmount: 300000,
              maturityDate: "2028-06-01T00:00:00.000Z",
              probabilityOfDefault: 0.05,
              riskBand: "Medium",
              expectedPortfolioLoss: 8750,
              riskNarrative: "Risk upgraded due to sector headwinds",
              simulatedDefaultRate: 0.04,
              tailRiskLoss: 45000,
              worstCaseLoss: 60000,
            },
          },
        ],
      };
    },
  },
]);
