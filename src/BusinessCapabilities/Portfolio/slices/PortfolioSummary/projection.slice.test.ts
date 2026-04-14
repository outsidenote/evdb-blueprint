import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioSummarySlice } from "../index.js";

ProjectionSliceTester.run(portfolioSummarySlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = `PORT-INIT-${randomUUID()}`;
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            loanAmount: 10000,
            capitalRequirement: 1000,
            expectedLoss: 120,
            riskWeight: 0.30,
            probabilityOfDefault: 0.05,
          } },
        ],
        then: [{ key: portfolioId, expectedState: {
          portfolioId,
          totalLoans: 1,
          totalExposure: 10000,
          totalCapitalRequirement: 1000,
          totalExpectedLoss: 120,
          sumWeightedRiskWeight: 3000,
          sumWeightedPD: 500,
          averageRiskWeight: 0.30,
          averageProbabilityOfDefault: 0.05,
          averageRating: "A",
          riskBand: "Investment Grade",
          worstRating: "A",
          worstRiskWeight: 0.30,
        } }],
      };
    },
  },
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      // Event 1: loanAmount=10000, riskWeight=0.30 (→ A), PD=0.05
      // Event 2: loanAmount=5000,  riskWeight=0.60 (→ BB), PD=0.08
      // averageRiskWeight = (0.30*10000 + 0.60*5000) / 15000 = 6000/15000 = 0.40 (→ BBB)
      // averagePD        = (0.05*10000 + 0.08*5000) / 15000 = 900/15000 = 0.06
      // worstRating      = BB (riskWeight 0.60 > 0.30)
      const portfolioId = `PORT-ACCUM-${randomUUID()}`;
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            loanAmount: 10000,
            capitalRequirement: 800,
            expectedLoss: 100,
            riskWeight: 0.30,
            probabilityOfDefault: 0.05,
          } },
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            loanAmount: 5000,
            capitalRequirement: 500,
            expectedLoss: 80,
            riskWeight: 0.60,
            probabilityOfDefault: 0.08,
          } },
        ],
        then: [{ key: portfolioId, expectedState: {
          portfolioId,
          totalLoans: 2,
          totalExposure: 15000,
          totalCapitalRequirement: 1300,
          totalExpectedLoss: 180,
          sumWeightedRiskWeight: 6000,
          sumWeightedPD: 900,
          averageRiskWeight: 0.4,
          averageProbabilityOfDefault: 0.06,
          averageRating: "BBB",
          riskBand: "Investment Grade",
          worstRating: "BB",
          worstRiskWeight: 0.60,
        } }],
      };
    },
  },
]);
