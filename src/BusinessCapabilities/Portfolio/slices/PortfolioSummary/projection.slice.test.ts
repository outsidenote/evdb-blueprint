import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioSummarySlice } from "./index.js";

ProjectionSliceTester.run(portfolioSummarySlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const key = randomUUID();
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId: key,
            loanAmount: 5000,
            capitalRequirement: 400,
            expectedLoss: 25,
            riskWeight: 0.30,
            probabilityOfDefault: 3,
          } },
        ],
        then: [{ key, expectedState: {
          // averageRiskWeight = riskWeight (single loan, no blending needed) = 0.30
          // averageRating: 0.30 > 0.25, 0.30 <= 0.35 → "A"
          // riskBand: 0.30 <= 0.55 → "Investment Grade"
          // worstRiskWeight = riskWeight of only loan = 0.30
          // worstRating: 0.30 <= 0.35 → "A"
          portfolioId: key,
          totalLoans: 1,
          totalExposure: 5000,
          totalCapitalRequirement: 400,
          totalExpectedLoss: 25,
          averageRiskWeight: 0.30,
          averageProbabilityOfDefault: 3,
          averageRating: "A",
          riskBand: "Investment Grade",
          worstRiskWeight: 0.30,
          worstRating: "A",
        } }],
      };
    },
  },
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      const key = randomUUID();
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId: key,
            loanAmount: 8000,
            capitalRequirement: 640,
            expectedLoss: 40,
            riskWeight: 0.20,
            probabilityOfDefault: 2,
          } },
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId: key,
            loanAmount: 12000,
            capitalRequirement: 1200,
            expectedLoss: 120,
            riskWeight: 0.60,
            probabilityOfDefault: 8,
          } },
        ],
        then: [{ key, expectedState: {
          // totalLoans: 1 + 1 = 2
          // totalExposure: 8000 + 12000 = 20000
          // totalCapitalRequirement: 640 + 1200 = 1840
          // totalExpectedLoss: 40 + 120 = 160
          // averageRiskWeight (weighted by loanAmount):
          //   (8000 * 0.20 + 12000 * 0.60) / 20000
          //   = (1600 + 7200) / 20000
          //   = 8800 / 20000
          //   = 0.44
          // averageProbabilityOfDefault (weighted by loanAmount):
          //   (8000 * 2 + 12000 * 8) / 20000
          //   = (16000 + 96000) / 20000
          //   = 112000 / 20000
          //   = 5.6
          // averageRating: 0.44 > 0.35, 0.44 <= 0.50 → "BBB"
          // riskBand: 0.44 <= 0.55 → "Investment Grade"
          // worstRiskWeight: max(0.20, 0.60) = 0.60
          // worstRating: 0.60 > 0.50, 0.60 <= 0.75 → "BB"
          portfolioId: key,
          totalLoans: 2,
          totalExposure: 20000,
          totalCapitalRequirement: 1840,
          totalExpectedLoss: 160,
          averageRiskWeight: 0.44,
          averageProbabilityOfDefault: 5.6,
          averageRating: "BBB",
          riskBand: "Investment Grade",
          worstRiskWeight: 0.60,
          worstRating: "BB",
        } }],
      };
    },
  },
]);
