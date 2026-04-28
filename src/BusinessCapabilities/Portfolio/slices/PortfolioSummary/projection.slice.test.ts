import { randomUUID } from "node:crypto";
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
      // Single loan: riskWeight=0.30 → rating="A" (≤0.35), riskBand="Investment Grade" (≤0.55)
      // averageRiskWeight = riskWeight = 0.30 (no weighted avg needed for one loan)
      // averageProbabilityOfDefault = probabilityOfDefault = 5
      // worstRating = rating of only loan = "A"
      const key = randomUUID();
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: key,
              loanAmount: 10000,
              riskWeight: 0.30,
              probabilityOfDefault: 5,
              capitalRequirement: 1000,
              expectedLoss: 12,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId: key,
              // totalLoans: 1 (first event)
              totalLoans: 1,
              // totalExposure: 10000 (= loanAmount)
              totalExposure: 10000,
              // totalCapitalRequirement: 1000 (= capitalRequirement)
              totalCapitalRequirement: 1000,
              // totalExpectedLoss: 12 (= expectedLoss)
              totalExpectedLoss: 12,
              // averageRiskWeight: 0.30 (= riskWeight, single loan)
              averageRiskWeight: 0.30,
              // averageProbabilityOfDefault: 5 (= probabilityOfDefault, single loan)
              averageProbabilityOfDefault: 5,
              // averageRating: "A" — 0.30 ≤ 0.35 → A
              averageRating: "A",
              // riskBand: "Investment Grade" — 0.30 ≤ 0.55
              riskBand: "Investment Grade",
              // worstRating: "A" — only one loan, its rating is the worst
              worstRating: "A",
            },
          },
        ],
      };
    },
  },
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      // Event 1: loanAmount=10000, riskWeight=0.30, probabilityOfDefault=4, capitalReq=1000, expLoss=12
      // Event 2: loanAmount=5000,  riskWeight=0.60, probabilityOfDefault=10, capitalReq=500,  expLoss=25
      //
      // totalLoans:              1 + 1 = 2
      // totalExposure:           10000 + 5000 = 15000
      // totalCapitalRequirement: 1000 + 500 = 1500
      // totalExpectedLoss:       12 + 25 = 37
      //
      // averageRiskWeight (weighted by loanAmount):
      //   (10000 * 0.30 + 5000 * 0.60) / (10000 + 5000)
      //   = (3000 + 3000) / 15000 = 6000 / 15000 = 0.4
      //
      // averageProbabilityOfDefault (weighted by loanAmount):
      //   (10000 * 4 + 5000 * 10) / (10000 + 5000)
      //   = (40000 + 50000) / 15000 = 90000 / 15000 = 6
      //
      // averageRating from averageRiskWeight=0.4: 0.35 < 0.4 ≤ 0.50 → "BBB"
      // riskBand from averageRiskWeight=0.4: 0.4 ≤ 0.55 → "Investment Grade"
      //
      // worstRating: loan1 riskWeight=0.30→"A" (rank 4), loan2 riskWeight=0.60→"BB" (rank 2)
      //   BB has lower rank (worse credit quality) → worstRating = "BB"
      const key = randomUUID();
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: key,
              loanAmount: 10000,
              riskWeight: 0.30,
              probabilityOfDefault: 4,
              capitalRequirement: 1000,
              expectedLoss: 12,
            },
          },
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: key,
              loanAmount: 5000,
              riskWeight: 0.60,
              probabilityOfDefault: 10,
              capitalRequirement: 500,
              expectedLoss: 25,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId: key,
              totalLoans: 2,
              totalExposure: 15000,
              totalCapitalRequirement: 1500,
              totalExpectedLoss: 37,
              averageRiskWeight: 0.4,
              averageProbabilityOfDefault: 6,
              averageRating: "BBB",
              riskBand: "Investment Grade",
              worstRating: "BB",
            },
          },
        ],
      };
    },
  },
]);
