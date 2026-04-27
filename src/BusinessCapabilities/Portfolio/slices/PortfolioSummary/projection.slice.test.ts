import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioSummarySlice } from "./index.js";

ProjectionSliceTester.run(portfolioSummarySlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      // Key matches how the handler builds it: key = p.portfolioId
      const portfolioId = "PORT-TEST-01";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanAmount: 100000,
              capitalRequirement: 8000,
              expectedLoss: 1000,
              riskWeight: 0.30,
              probabilityOfDefault: 0.05,
            },
          },
        ],
        then: [
          {
            key: portfolioId,
            expectedState: {
              portfolioId: "PORT-TEST-01",
              totalLoans: 1,
              // totalExposure = loanAmount = 100000
              totalExposure: 100000,
              // totalCapitalRequirement = capitalRequirement = 8000
              totalCapitalRequirement: 8000,
              // totalExpectedLoss = expectedLoss = 1000
              totalExpectedLoss: 1000,
              // weightedRiskWeightSum = riskWeight * loanAmount = 0.30 * 100000 = 30000
              weightedRiskWeightSum: 30000,
              // weightedPodSum = probabilityOfDefault * loanAmount = 0.05 * 100000 = 5000
              weightedPodSum: 5000,
              // averageRiskWeight = weightedRiskWeightSum / totalExposure = 30000 / 100000 = 0.30
              averageRiskWeight: 0.30,
              // averageProbabilityOfDefault = weightedPodSum / totalExposure = 5000 / 100000 = 0.05
              averageProbabilityOfDefault: 0.05,
              // averageRating: 0.30 > 0.25 AND <= 0.35 → "A"
              averageRating: "A",
              // riskBand: 0.30 <= 0.55 → "Investment Grade"
              riskBand: "Investment Grade",
              // worstRiskWeight: only one loan → 0.30
              worstRiskWeight: 0.30,
              // worstRating: 0.30 > 0.25 AND <= 0.35 → "A"
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
      // Spec: Aggregates per portfolio. Each LoanRiskAssessed increments totalLoans by 1,
      // adds loanAmount to totalExposure, adds capitalRequirement to totalCapitalRequirement,
      // adds expectedLoss to totalExpectedLoss.
      // averageRiskWeight = weighted average of riskWeight by loanAmount.
      // worstRating tracks the highest riskWeight seen.
      const portfolioId = "PORT-TEST-02";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanAmount: 100000,
              capitalRequirement: 8000,
              expectedLoss: 1000,
              riskWeight: 0.20,      // → AA initially
              probabilityOfDefault: 0.02,
            },
          },
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanAmount: 100000,
              capitalRequirement: 12000,
              expectedLoss: 2000,
              riskWeight: 0.40,      // → BBB; higher than first loan's 0.20
              probabilityOfDefault: 0.06,
            },
          },
        ],
        then: [
          {
            key: portfolioId,
            expectedState: {
              portfolioId: "PORT-TEST-02",
              // totalLoans: 1 + 1 = 2
              totalLoans: 2,
              // totalExposure: 100000 + 100000 = 200000
              totalExposure: 200000,
              // totalCapitalRequirement: 8000 + 12000 = 20000
              totalCapitalRequirement: 20000,
              // totalExpectedLoss: 1000 + 2000 = 3000
              totalExpectedLoss: 3000,
              // weightedRiskWeightSum: (0.20 * 100000) + (0.40 * 100000) = 20000 + 40000 = 60000
              weightedRiskWeightSum: 60000,
              // weightedPodSum: (0.02 * 100000) + (0.06 * 100000) = 2000 + 6000 = 8000
              weightedPodSum: 8000,
              // averageRiskWeight: 60000 / 200000 = 0.30
              averageRiskWeight: 0.30,
              // averageProbabilityOfDefault: 8000 / 200000 = 0.04
              averageProbabilityOfDefault: 0.04,
              // averageRating: 0.30 > 0.25 AND <= 0.35 → "A"
              averageRating: "A",
              // riskBand: 0.30 <= 0.55 → "Investment Grade"
              riskBand: "Investment Grade",
              // worstRiskWeight: max(0.20, 0.40) = 0.40
              worstRiskWeight: 0.40,
              // worstRating: 0.40 > 0.35 AND <= 0.50 → "BBB"
              worstRating: "BBB",
            },
          },
        ],
      };
    },
  },
]);
