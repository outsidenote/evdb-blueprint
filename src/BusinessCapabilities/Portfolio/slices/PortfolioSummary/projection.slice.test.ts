import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioSummarySlice } from "./index.js";

ProjectionSliceTester.run(portfolioSummarySlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      // Key matches how the projection handler builds it: p.portfolioId
      const key = "PORT-01";
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId: "PORT-01",
            loanAmount: 10000,
            capitalRequirement: 1000,
            expectedLoss: 12,
            riskWeight: 0.30,
            probabilityOfDefault: 0.05,
          } },
        ],
        then: [{ key, expectedState: {
          portfolioId: "PORT-01",
          totalLoans: 1,
          // totalExposure = loanAmount = 10000
          totalExposure: 10000,
          // totalCapitalRequirement = capitalRequirement = 1000
          totalCapitalRequirement: 1000,
          // totalExpectedLoss = expectedLoss = 12
          totalExpectedLoss: 12,
          // averageRiskWeight = riskWeight (single loan) = 0.30
          averageRiskWeight: 0.30,
          // averageProbabilityOfDefault = probabilityOfDefault (single loan) = 0.05
          averageProbabilityOfDefault: 0.05,
          // averageRating: 0.30 <= 0.35 → 'A'
          averageRating: "A",
          // riskBand: 0.30 <= 0.55 → 'Investment Grade'
          riskBand: "Investment Grade",
          // worstRating: only loan, riskWeight 0.30 <= 0.35 → 'A'
          worstRating: "A",
          worstRiskWeight: 0.30,
        } }],
      };
    },
  },
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      // Key matches how the projection handler builds it: p.portfolioId
      const key = "PORT-02";
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId: "PORT-02",
            loanAmount: 10000,
            capitalRequirement: 800,
            expectedLoss: 50,
            riskWeight: 0.30,
            probabilityOfDefault: 0.04,
          } },
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId: "PORT-02",
            loanAmount: 10000,
            capitalRequirement: 1200,
            expectedLoss: 100,
            riskWeight: 0.70,
            probabilityOfDefault: 0.08,
          } },
        ],
        then: [{ key, expectedState: {
          portfolioId: "PORT-02",
          totalLoans: 2,
          // totalExposure = 10000 + 10000 = 20000
          totalExposure: 20000,
          // totalCapitalRequirement = 800 + 1200 = 2000
          totalCapitalRequirement: 2000,
          // totalExpectedLoss = 50 + 100 = 150
          totalExpectedLoss: 150,
          // averageRiskWeight = (0.30 * 10000 + 0.70 * 10000) / (10000 + 10000)
          //                   = (3000 + 7000) / 20000 = 10000 / 20000 = 0.50
          averageRiskWeight: 0.50,
          // averageProbabilityOfDefault = (0.04 * 10000 + 0.08 * 10000) / 20000
          //                             = (400 + 800) / 20000 = 1200 / 20000 = 0.06
          averageProbabilityOfDefault: 0.06,
          // averageRating: 0.50 <= 0.50 → 'BBB'
          averageRating: "BBB",
          // riskBand: 0.50 <= 0.55 → 'Investment Grade'
          riskBand: "Investment Grade",
          // worstRating: loan 2 riskWeight 0.70 > loan 1's 0.30, worst = 0.70 <= 0.75 → 'BB'
          worstRating: "BB",
          worstRiskWeight: 0.70,
        } }],
      };
    },
  },
]);
