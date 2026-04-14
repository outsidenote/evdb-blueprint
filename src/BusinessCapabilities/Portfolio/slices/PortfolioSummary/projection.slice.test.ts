import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioSummarySlice } from "../index.js";

ProjectionSliceTester.run(portfolioSummarySlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = "PORT-01";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanAmount: 500000,
              capitalRequirement: 40000,
              expectedLoss: 2500,
              riskWeight: 0.30,
              probabilityOfDefault: 0.02,
            },
          },
        ],
        then: [
          {
            key: portfolioId,
            expectedState: {
              portfolioId: "PORT-01",
              totalLoans: 1,
              totalExposure: 500000,
              totalCapitalRequirement: 40000,
              totalExpectedLoss: 2500,
              totalWeightedRiskWeight: 150000,
              totalWeightedPD: 10000,
              averageRiskWeight: 0.30,
              averageProbabilityOfDefault: 0.02,
              averageRating: "A",
              riskBand: "Investment Grade",
              worstRating: "A",
              worstRiskWeight: 0.30,
            },
          },
        ],
      };
    },
  },
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      // Event 1: riskWeight 0.20 (AA), loanAmount 3000000
      // Event 2: riskWeight 0.80 (B, worst), loanAmount 1000000
      // averageRiskWeight = (0.20*3000000 + 0.80*1000000) / 4000000 = 1400000/4000000 = 0.35 → A
      // averagePD = (0.01*3000000 + 0.07*1000000) / 4000000 = 100000/4000000 = 0.025
      // worstRating = B (riskWeight 0.80 > 0.20)
      const portfolioId = "PORT-02";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanAmount: 3000000,
              capitalRequirement: 180000,
              expectedLoss: 9000,
              riskWeight: 0.20,
              probabilityOfDefault: 0.01,
            },
          },
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanAmount: 1000000,
              capitalRequirement: 120000,
              expectedLoss: 15000,
              riskWeight: 0.80,
              probabilityOfDefault: 0.07,
            },
          },
        ],
        then: [
          {
            key: portfolioId,
            expectedState: {
              portfolioId: "PORT-02",
              totalLoans: 2,
              totalExposure: 4000000,
              totalCapitalRequirement: 300000,
              totalExpectedLoss: 24000,
              totalWeightedRiskWeight: 1400000,
              totalWeightedPD: 100000,
              averageRiskWeight: 0.35,
              averageProbabilityOfDefault: 0.025,
              averageRating: "A",
              riskBand: "Investment Grade",
              worstRating: "B",
              worstRiskWeight: 0.80,
            },
          },
        ],
      };
    },
  },
]);
