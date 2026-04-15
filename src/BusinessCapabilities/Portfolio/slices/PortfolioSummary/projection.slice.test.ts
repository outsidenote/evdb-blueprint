import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioSummarySlice } from "./index.js";

ProjectionSliceTester.run(portfolioSummarySlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = "PORT-T1";
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            loanAmount: 1000000,
            riskWeight: 0.30,
            probabilityOfDefault: 0.02,
            capitalRequirement: 80000,
            expectedLoss: 5000,
          } },
        ],
        then: [{ key: portfolioId, expectedState: {
          portfolioId: "PORT-T1",
          // totalLoans: 1st loan → 1
          totalLoans: 1,
          // totalExposure: loanAmount = 1000000
          totalExposure: 1000000,
          // totalCapitalRequirement: capitalRequirement = 80000
          totalCapitalRequirement: 80000,
          // totalExpectedLoss: expectedLoss = 5000
          totalExpectedLoss: 5000,
          // averageRiskWeight: single loan → riskWeight = 0.30
          averageRiskWeight: 0.30,
          // averageProbabilityOfDefault: single loan → probabilityOfDefault = 0.02
          averageProbabilityOfDefault: 0.02,
          // averageRating: 0.30 ≤ 0.35 → A
          averageRating: "A",
          // riskBand: 0.30 ≤ 0.55 → Investment Grade
          riskBand: "Investment Grade",
          // worstRating: only loan, riskWeight = 0.30, 0.30 ≤ 0.35 → A
          worstRating: "A",
        } }],
      };
    },
  },
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      const portfolioId = "PORT-T2";
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            loanAmount: 1000000,
            riskWeight: 0.20,
            probabilityOfDefault: 0.10,
            capitalRequirement: 50000,
            expectedLoss: 2000,
          } },
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            loanAmount: 1000000,
            riskWeight: 0.60,
            probabilityOfDefault: 0.30,
            capitalRequirement: 200000,
            expectedLoss: 30000,
          } },
        ],
        then: [{ key: portfolioId, expectedState: {
          portfolioId: "PORT-T2",
          // totalLoans: 1 + 1 = 2
          totalLoans: 2,
          // totalExposure: 1000000 + 1000000 = 2000000
          totalExposure: 2000000,
          // totalCapitalRequirement: 50000 + 200000 = 250000
          totalCapitalRequirement: 250000,
          // totalExpectedLoss: 2000 + 30000 = 32000
          totalExpectedLoss: 32000,
          // totalWeightedRisk: 1000000×0.20 + 1000000×0.60 = 200000 + 600000 = 800000
          // averageRiskWeight: 800000 / 2000000 = 0.40
          averageRiskWeight: 0.40,
          // totalWeightedPd: 1000000×0.10 + 1000000×0.30 = 100000 + 300000 = 400000
          // averageProbabilityOfDefault: 400000 / 2000000 = 0.20
          averageProbabilityOfDefault: 0.20,
          // averageRating: 0.40 ≤ 0.50 → BBB
          averageRating: "BBB",
          // riskBand: 0.40 ≤ 0.55 → Investment Grade
          riskBand: "Investment Grade",
          // worstRiskWeight: GREATEST(0.20, 0.60) = 0.60
          // worstRating: 0.60 ≤ 0.75 → BB
          worstRating: "BB",
        } }],
      };
    },
  },
]);
