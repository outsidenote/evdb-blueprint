import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioSummarySlice } from "./index.js";

ProjectionSliceTester.run(portfolioSummarySlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      // Single loan: loanAmount=10000, riskWeight=0.30, probabilityOfDefault=0.05
      // totalLoans = 1
      // totalExposure = 10000
      // totalCapitalRequirement = 1000
      // totalExpectedLoss = 120
      // averageRiskWeight = 0.30 (single loan, equals riskWeight directly)
      //   0.30 <= 0.35 → averageRating = "A"
      //   0.30 <= 0.55 → riskBand = "Investment Grade"
      // averageProbabilityOfDefault = 0.05 (single loan)
      // worstRiskWeight = 0.30; 0.30 <= 0.35 → worstRating = "A"
      const key = "PORT-01";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-01",
              loanAmount: 10000,
              capitalRequirement: 1000,
              expectedLoss: 120,
              riskWeight: 0.30,
              probabilityOfDefault: 0.05,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId: "PORT-01",
              totalLoans: 1,
              // totalExposure = 10000
              totalExposure: 10000,
              // totalCapitalRequirement = 1000
              totalCapitalRequirement: 1000,
              // totalExpectedLoss = 120
              totalExpectedLoss: 120,
              // averageRiskWeight = 0.30 (single loan)
              averageRiskWeight: 0.30,
              // averageProbabilityOfDefault = 0.05 (single loan)
              averageProbabilityOfDefault: 0.05,
              // 0.30 <= 0.35 → "A"
              averageRating: "A",
              // 0.30 <= 0.55 → "Investment Grade"
              riskBand: "Investment Grade",
              // worstRiskWeight = 0.30; 0.30 <= 0.35 → "A"
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
      // Event 1: loanAmount=10000, riskWeight=0.20, probabilityOfDefault=0.06
      // Event 2: loanAmount=10000, riskWeight=0.40, probabilityOfDefault=0.02
      //
      // totalLoans = 1 + 1 = 2
      // totalExposure = 10000 + 10000 = 20000
      // totalCapitalRequirement = 800 + 1200 = 2000
      // totalExpectedLoss = 100 + 200 = 300
      //
      // averageRiskWeight = (0.20 × 10000 + 0.40 × 10000) / 20000
      //   = (2000 + 4000) / 20000 = 6000 / 20000 = 0.30
      //   0.30 <= 0.35 → averageRating = "A"
      //   0.30 <= 0.55 → riskBand = "Investment Grade"
      //
      // averageProbabilityOfDefault = (0.06 × 10000 + 0.02 × 10000) / 20000
      //   = (600 + 200) / 20000 = 800 / 20000 = 0.04
      //
      // worstRiskWeight = GREATEST(0.20, 0.40) = 0.40
      //   0.40 <= 0.50 → worstRating = "BBB"
      const key = "PORT-02";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-02",
              loanAmount: 10000,
              capitalRequirement: 800,
              expectedLoss: 100,
              riskWeight: 0.20,
              probabilityOfDefault: 0.06,
            },
          },
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-02",
              loanAmount: 10000,
              capitalRequirement: 1200,
              expectedLoss: 200,
              riskWeight: 0.40,
              probabilityOfDefault: 0.02,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId: "PORT-02",
              totalLoans: 2,
              // totalExposure = 10000 + 10000 = 20000
              totalExposure: 20000,
              // totalCapitalRequirement = 800 + 1200 = 2000
              totalCapitalRequirement: 2000,
              // totalExpectedLoss = 100 + 200 = 300
              totalExpectedLoss: 300,
              // averageRiskWeight = (0.20 × 10000 + 0.40 × 10000) / 20000 = 0.30
              averageRiskWeight: 0.30,
              // averageProbabilityOfDefault = (0.06 × 10000 + 0.02 × 10000) / 20000 = 0.04
              averageProbabilityOfDefault: 0.04,
              // 0.30 <= 0.35 → "A"
              averageRating: "A",
              // 0.30 <= 0.55 → "Investment Grade"
              riskBand: "Investment Grade",
              // worstRiskWeight = GREATEST(0.20, 0.40) = 0.40; 0.40 <= 0.50 → "BBB"
              worstRating: "BBB",
              worstRiskWeight: 0.40,
            },
          },
        ],
      };
    },
  },
]);
