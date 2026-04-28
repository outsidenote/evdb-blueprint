import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioSummarySlice } from "./index.js";

ProjectionSliceTester.run(portfolioSummarySlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      // A-rated loan: riskWeight = capitalRequirement / (loanAmount * 0.08)
      //   = 28000 / (1000000 * 0.08) = 0.35
      const portfolioId = randomUUID();
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanAmount: 1000000,
              capitalRequirement: 28000,    // 1000000 * 0.35 * 0.08 (A rating, <5yr maturity)
              expectedLoss: 225,            // 1000000 * 0.0005 * 0.45
              probabilityOfDefault: 0.0005, // A rating: 0.05%
              creditRating: "A",
            },
          },
        ],
        then: [
          {
            key: portfolioId,
            expectedState: {
              // totalLoans: first event → 1
              totalLoans: 1,
              // totalExposure = loanAmount = 1000000
              totalExposure: 1000000,
              // totalCapitalRequirement = capitalRequirement = 28000
              totalCapitalRequirement: 28000,
              // totalExpectedLoss = expectedLoss = 225
              totalExpectedLoss: 225,
              // averageProbabilityOfDefault = probabilityOfDefault (single loan) = 0.0005
              averageProbabilityOfDefault: 0.0005,
              // averageRiskWeight = 28000 / (1000000 * 0.08) = 0.35
              averageRiskWeight: 0.35,
              // averageRating: 0.35 ≤ 0.35 → 'A'
              averageRating: "A",
              // riskBand: 0.35 ≤ 0.55 → 'Investment Grade'
              riskBand: "Investment Grade",
              // worstRating: only one loan → creditRating = 'A'
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
      // Event 1: A-rated loan   (riskWeight = 0.35, loanAmount = 1000000)
      // Event 2: BBB-rated loan (riskWeight = 0.50, loanAmount = 500000)
      const portfolioId = randomUUID();
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanAmount: 1000000,
              capitalRequirement: 28000,    // 1000000 * 0.35 * 0.08
              expectedLoss: 225,            // 1000000 * 0.0005 * 0.45
              probabilityOfDefault: 0.0005, // A rating
              creditRating: "A",
            },
          },
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanAmount: 500000,
              capitalRequirement: 20000,    // 500000 * 0.50 * 0.08
              expectedLoss: 450,            // 500000 * 0.0020 * 0.45
              probabilityOfDefault: 0.0020, // BBB rating
              creditRating: "BBB",
            },
          },
        ],
        then: [
          {
            key: portfolioId,
            expectedState: {
              // totalLoans = 1 + 1 = 2
              totalLoans: 2,
              // totalExposure = 1000000 + 500000 = 1500000
              totalExposure: 1500000,
              // totalCapitalRequirement = 28000 + 20000 = 48000
              totalCapitalRequirement: 48000,
              // totalExpectedLoss = 225 + 450 = 675
              totalExpectedLoss: 675,
              // averageProbabilityOfDefault:
              //   (0.0005 * 1000000 + 0.0020 * 500000) / (1000000 + 500000)
              //   = (500 + 1000) / 1500000 = 1500 / 1500000 = 0.001
              averageProbabilityOfDefault: 0.001,
              // averageRiskWeight:
              //   (0.35 * 1000000 + 0.50 * 500000) / (1000000 + 500000)
              //   = (350000 + 250000) / 1500000 = 600000 / 1500000 = 0.4
              averageRiskWeight: 0.4,
              // averageRating: 0.4 > 0.35 and ≤ 0.50 → 'BBB'
              averageRating: "BBB",
              // riskBand: 0.4 ≤ 0.55 → 'Investment Grade'
              riskBand: "Investment Grade",
              // worstRating: BBB riskWeight (0.50) > A riskWeight (0.35) → 'BBB'
              worstRating: "BBB",
            },
          },
        ],
      };
    },
  },
]);
