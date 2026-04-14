import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioSummarySlice } from "./index.js";

ProjectionSliceTester.run(portfolioSummarySlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      // Single AA-rated loan: riskWeight 0.20 → AA rating, Investment Grade band
      const key = "PORT-01";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-01",
              loanId: "LOAN-001",
              loanAmount: 1000,
              capitalRequirement: 100,
              expectedLoss: 10,
              riskWeight: 0.20,
              probabilityOfDefault: 0.01,
              creditRating: "AA",
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId: "PORT-01",
              totalLoans: 1,
              totalExposure: 1000,
              totalCapitalRequirement: 100,
              totalExpectedLoss: 10,
              totalWeightedRiskWeight: 200,       // 1000 * 0.20
              totalWeightedProbabilityOfDefault: 10, // 1000 * 0.01
              averageRiskWeight: 0.20,
              averageProbabilityOfDefault: 0.01,
              averageRating: "AA",                // 0.20 ≤ 0.25
              riskBand: "Investment Grade",        // 0.20 ≤ 0.55
              worstRating: "AA",
              worstRiskWeight: 0.20,
            },
          },
        ],
      };
    },
  },
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      // Event 1: loanAmount=2000, riskWeight=0.20 (AA); Event 2: loanAmount=2000, riskWeight=0.60 (BB)
      // averageRiskWeight = (400 + 1200) / 4000 = 0.40 → BBB; worstRating → BB (0.60 > 0.20)
      const key = "PORT-02";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-02",
              loanId: "LOAN-001",
              loanAmount: 2000,
              capitalRequirement: 200,
              expectedLoss: 20,
              riskWeight: 0.20,
              probabilityOfDefault: 0.01,
              creditRating: "AA",
            },
          },
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-02",
              loanId: "LOAN-002",
              loanAmount: 2000,
              capitalRequirement: 400,
              expectedLoss: 40,
              riskWeight: 0.60,
              probabilityOfDefault: 0.05,
              creditRating: "BB",
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId: "PORT-02",
              totalLoans: 2,
              totalExposure: 4000,               // 2000 + 2000
              totalCapitalRequirement: 600,       // 200 + 400
              totalExpectedLoss: 60,             // 20 + 40
              totalWeightedRiskWeight: 1600,     // (2000*0.20) + (2000*0.60) = 400 + 1200
              totalWeightedProbabilityOfDefault: 120, // (2000*0.01) + (2000*0.05) = 20 + 100
              averageRiskWeight: 0.40,           // 1600 / 4000
              averageProbabilityOfDefault: 0.03, // 120 / 4000
              averageRating: "BBB",              // 0.35 < 0.40 ≤ 0.50
              riskBand: "Investment Grade",       // 0.40 ≤ 0.55
              worstRating: "BB",                 // 0.60 > 0.20, so BB wins
              worstRiskWeight: 0.60,
            },
          },
        ],
      };
    },
  },
]);
