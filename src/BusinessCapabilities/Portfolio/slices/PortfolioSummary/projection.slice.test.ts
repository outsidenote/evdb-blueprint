import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioSummarySlice } from "./index.js";

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
              loanAmount: 10000,
              capitalRequirement: 800,
              expectedLoss: 200,
              riskWeight: 0.20,
              probabilityOfDefault: 0.02,
            },
          },
        ],
        then: [
          {
            key: portfolioId,
            expectedState: {
              portfolioId,
              totalLoans: 1,
              totalExposure: 10000,
              totalCapitalRequirement: 800,
              totalExpectedLoss: 200,
              totalRiskWeightedAmount: 2000,
              totalPDWeightedAmount: 200,
              averageRiskWeight: 0.20,
              averageProbabilityOfDefault: 0.02,
              averageRating: "AA",
              riskBand: "Investment Grade",
              worstRiskWeight: 0.20,
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
      // Event 1: riskWeight=0.20, loanAmount=10000 → totalRiskWeightedAmount=2000
      // Event 2: riskWeight=0.40, loanAmount=10000 → totalRiskWeightedAmount+=4000 → total=6000
      // averageRiskWeight = 6000 / 20000 = 0.30 → 'A'
      // worstRiskWeight = GREATEST(0.20, 0.40) = 0.40 → worstRating='BBB'
      const portfolioId = "PORT-02";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanAmount: 10000,
              capitalRequirement: 800,
              expectedLoss: 200,
              riskWeight: 0.20,
              probabilityOfDefault: 0.02,
            },
          },
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanAmount: 10000,
              capitalRequirement: 600,
              expectedLoss: 100,
              riskWeight: 0.40,
              probabilityOfDefault: 0.04,
            },
          },
        ],
        then: [
          {
            key: portfolioId,
            expectedState: {
              portfolioId,
              totalLoans: 2,
              totalExposure: 20000,
              totalCapitalRequirement: 1400,
              totalExpectedLoss: 300,
              totalRiskWeightedAmount: 6000,
              totalPDWeightedAmount: 600,
              averageRiskWeight: 0.30,
              averageProbabilityOfDefault: 0.03,
              averageRating: "A",
              riskBand: "Investment Grade",
              worstRiskWeight: 0.40,
              worstRating: "BBB",
            },
          },
        ],
      };
    },
  },
]);
