import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioSummarySlice } from "./index.js";

ProjectionSliceTester.run(portfolioSummarySlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId: "PORT-01",
            loanAmount: 1000000,
            capitalRequirement: 80000,
            expectedLoss: 5000,
            riskWeight: 0.30,
            probabilityOfDefault: 0.02,
          } },
        ],
        then: [{ key: "PORT-01", expectedState: {
          portfolioId: "PORT-01",
          totalLoans: 1,
          totalExposure: 1000000,
          totalCapitalRequirement: 80000,
          totalExpectedLoss: 5000,
          averageRiskWeight: 0.30,
          averageProbabilityOfDefault: 0.02,
          averageRating: "A",
          riskBand: "Investment Grade",
          worstRating: "A",
        } }],
      };
    },
  },
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      // Event 1: loanAmount=1000000, riskWeight=0.30 (A range)
      // Event 2: loanAmount=2000000, riskWeight=0.60 (BB range)
      // averageRiskWeight = (1000000*0.30 + 2000000*0.60) / 3000000 = 0.50 (BBB boundary)
      // averageProbabilityOfDefault = (1000000*0.02 + 2000000*0.05) / 3000000 = 0.04
      // worstRating: riskWeight 0.60 > threshold(A=0.35) → BB (0.60 ≤ 0.75)
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId: "PORT-01",
            loanAmount: 1000000,
            capitalRequirement: 80000,
            expectedLoss: 5000,
            riskWeight: 0.30,
            probabilityOfDefault: 0.02,
          } },
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId: "PORT-01",
            loanAmount: 2000000,
            capitalRequirement: 200000,
            expectedLoss: 20000,
            riskWeight: 0.60,
            probabilityOfDefault: 0.05,
          } },
        ],
        then: [{ key: "PORT-01", expectedState: {
          portfolioId: "PORT-01",
          totalLoans: 2,
          totalExposure: 3000000,
          totalCapitalRequirement: 280000,
          totalExpectedLoss: 25000,
          averageRiskWeight: 0.50,
          averageProbabilityOfDefault: 0.04,
          averageRating: "BBB",
          riskBand: "Investment Grade",
          worstRating: "BB",
        } }],
      };
    },
  },
]);
