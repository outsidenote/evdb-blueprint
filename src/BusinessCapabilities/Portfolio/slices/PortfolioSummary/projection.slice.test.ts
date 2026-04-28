import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioSummarySlice } from "./index.js";

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

ProjectionSliceTester.run(portfolioSummarySlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      // Single AA-rated loan: riskWeight = 0.25 (Basel III)
      // capitalRequirement = loanAmount * riskWeight * 0.08 = 100000 * 0.25 * 0.08 = 2000
      const portfolioId = "PORT-01";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanAmount: 100000,
              capitalRequirement: 2000,    // 100000 * 0.25 * 0.08 (AA, no maturity adj)
              expectedLoss: 4.5,           // 100000 * 0.0001 * 0.45
              probabilityOfDefault: 0.0001,
              creditRating: "AA",
              // Remaining event fields (not consumed by this projection)
              borrowerName: "Acme Corp",
              loanId: "LOAN-001",
              interestRate: 0.04,
              maturityDate: new Date("2027-01-01").toISOString(),
              acquisitionDate: new Date("2024-01-01").toISOString(),
              riskBand: "Investment Grade - Low",
              riskNarrative: "AA loan — low risk",
              simulatedDefaultRate: 0.0001,
              expectedPortfolioLoss: 4.5,
              worstCaseLoss: 0,
              tailRiskLoss: 0,
            },
          },
        ],
        then: [
          {
            key: portfolioId,
            expectedState: {
              portfolioId: "PORT-01",
              // totalLoans: first loan → 1
              totalLoans: 1,
              // totalExposure: loanAmount = 100000
              totalExposure: 100000,
              // totalCapitalRequirement: capitalRequirement = 2000
              totalCapitalRequirement: 2000,
              // totalExpectedLoss: expectedLoss = 4.5
              totalExpectedLoss: 4.5,
              // averageProbabilityOfDefault: single loan → probabilityOfDefault = 0.0001
              averageProbabilityOfDefault: 0.0001,
              // averageRiskWeight = totalCapReq / (0.08 * totalExposure)
              //                   = 2000 / (0.08 * 100000) = 2000 / 8000 = 0.25
              averageRiskWeight: 0.25,
              // averageRating: 0.25 ≤ 0.25 → 'AA'
              averageRating: "AA",
              // riskBand: 0.25 ≤ 0.55 → 'Investment Grade'
              riskBand: "Investment Grade",
              // worstRating: first loan → creditRating = 'AA'
              worstRating: "AA",
            },
          },
        ],
      };
    },
  },
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      // Event 1: AA loan — riskWeight 0.25
      //   capitalRequirement = 100000 * 0.25 * 0.08 = 2000
      //   expectedLoss       = 100000 * 0.0001 * 0.45 = 4.5
      // Event 2: BBB loan — riskWeight 0.50
      //   capitalRequirement = 100000 * 0.50 * 0.08 = 4000
      //   expectedLoss       = 100000 * 0.002 * 0.45 = 90
      const portfolioId = "PORT-02";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanAmount: 100000,
              capitalRequirement: 2000,
              expectedLoss: 4.5,
              probabilityOfDefault: 0.0001,
              creditRating: "AA",
              borrowerName: "Acme Corp",
              loanId: "LOAN-001",
              interestRate: 0.04,
              maturityDate: new Date("2027-01-01").toISOString(),
              acquisitionDate: new Date("2024-01-01").toISOString(),
              riskBand: "Investment Grade - Low",
              riskNarrative: "AA loan",
              simulatedDefaultRate: 0.0001,
              expectedPortfolioLoss: 4.5,
              worstCaseLoss: 0,
              tailRiskLoss: 0,
            },
          },
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanAmount: 100000,
              capitalRequirement: 4000,
              expectedLoss: 90,
              probabilityOfDefault: 0.002,
              creditRating: "BBB",
              borrowerName: "Beta Ltd",
              loanId: "LOAN-002",
              interestRate: 0.06,
              maturityDate: new Date("2028-06-01").toISOString(),
              acquisitionDate: new Date("2024-01-01").toISOString(),
              riskBand: "Investment Grade - Medium",
              riskNarrative: "BBB loan",
              simulatedDefaultRate: 0.002,
              expectedPortfolioLoss: 90,
              worstCaseLoss: 0,
              tailRiskLoss: 0,
            },
          },
        ],
        then: [
          {
            key: portfolioId,
            expectedState: {
              portfolioId: "PORT-02",
              // totalLoans: 1 + 1 = 2
              totalLoans: 2,
              // totalExposure: 100000 + 100000 = 200000
              totalExposure: 200000,
              // totalCapitalRequirement: 2000 + 4000 = 6000
              totalCapitalRequirement: 6000,
              // totalExpectedLoss: 4.5 + 90 = 94.5
              totalExpectedLoss: 94.5,
              // averageProbabilityOfDefault (weighted avg by loanAmount):
              //   = (0.0001 * 100000 + 0.002 * 100000) / 200000
              //   = (10 + 200) / 200000 = 210 / 200000 = 0.00105
              averageProbabilityOfDefault: 0.00105,
              // averageRiskWeight = totalCapReq / (0.08 * totalExposure)
              //                   = 6000 / (0.08 * 200000) = 6000 / 16000 = 0.375
              averageRiskWeight: 0.375,
              // averageRating: 0.35 < 0.375 ≤ 0.50 → 'BBB'
              averageRating: "BBB",
              // riskBand: 0.375 ≤ 0.55 → 'Investment Grade'
              riskBand: "Investment Grade",
              // worstRating: BBB riskWeight (0.50) > AA riskWeight (0.25) → 'BBB'
              worstRating: "BBB",
            },
          },
        ],
      };
    },
  },
]);
