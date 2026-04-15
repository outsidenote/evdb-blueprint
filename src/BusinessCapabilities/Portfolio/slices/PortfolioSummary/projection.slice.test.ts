import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioSummarySlice } from "./index.js";

ProjectionSliceTester.run(portfolioSummarySlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const key = "PORT-01";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-01",
              loanAmount: 100000,
              riskWeight: 0.30,
              probabilityOfDefault: 0.02,
              capitalRequirement: 5000,
              expectedLoss: 2000,
            },
          },
        ],
        then: [{
          key,
          expectedState: {
            portfolioId: "PORT-01",
            // totalLoans: first event → 1
            totalLoans: 1,
            // totalExposure: loanAmount = 100000
            totalExposure: 100000,
            // totalCapitalRequirement: capitalRequirement = 5000
            totalCapitalRequirement: 5000,
            // totalExpectedLoss: expectedLoss = 2000
            totalExpectedLoss: 2000,
            // averageRiskWeight: 1 loan → weighted avg = riskWeight = 0.30
            averageRiskWeight: 0.30,
            // averageProbabilityOfDefault: 1 loan → weighted avg = probabilityOfDefault = 0.02
            averageProbabilityOfDefault: 0.02,
            // averageRating: riskWeight 0.30 ≤ 0.35 → 'A'
            averageRating: "A",
            // riskBand: riskWeight 0.30 ≤ 0.55 → 'Investment Grade'
            riskBand: "Investment Grade",
            // worstRating: only 1 loan, riskWeight 0.30 ≤ 0.35 → 'A'
            worstRating: "A",
            // worstRiskWeight: helper field = riskWeight of worst loan = 0.30
            worstRiskWeight: 0.30,
          },
        }],
      };
    },
  },
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      // Loan 1: loanAmount=100000, riskWeight=0.30, probabilityOfDefault=0.02
      // Loan 2: loanAmount=200000, riskWeight=0.60, probabilityOfDefault=0.05
      const key = "PORT-02";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-02",
              loanAmount: 100000,
              riskWeight: 0.30,
              probabilityOfDefault: 0.02,
              capitalRequirement: 5000,
              expectedLoss: 2000,
            },
          },
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-02",
              loanAmount: 200000,
              riskWeight: 0.60,
              probabilityOfDefault: 0.05,
              capitalRequirement: 15000,
              expectedLoss: 10000,
            },
          },
        ],
        then: [{
          key,
          expectedState: {
            portfolioId: "PORT-02",
            // totalLoans: 1 + 1 = 2
            totalLoans: 2,
            // totalExposure: 100000 + 200000 = 300000
            totalExposure: 300000,
            // totalCapitalRequirement: 5000 + 15000 = 20000
            totalCapitalRequirement: 20000,
            // totalExpectedLoss: 2000 + 10000 = 12000
            totalExpectedLoss: 12000,
            // averageRiskWeight = (0.30 × 100000 + 0.60 × 200000) / (100000 + 200000)
            //                   = (30000 + 120000) / 300000
            //                   = 150000 / 300000 = 0.5
            averageRiskWeight: 0.5,
            // averageProbabilityOfDefault = (0.02 × 100000 + 0.05 × 200000) / (100000 + 200000)
            //                            = (2000 + 10000) / 300000
            //                            = 12000 / 300000 = 0.04
            averageProbabilityOfDefault: 0.04,
            // averageRating: averageRiskWeight 0.5 ≤ 0.50 → 'BBB'
            averageRating: "BBB",
            // riskBand: averageRiskWeight 0.5 ≤ 0.55 → 'Investment Grade'
            riskBand: "Investment Grade",
            // worstRating: loan 2 riskWeight 0.60 > loan 1 riskWeight 0.30 → worst is loan 2
            //              riskWeight 0.60 ≤ 0.75 → 'BB'
            worstRating: "BB",
            // worstRiskWeight: GREATEST(0.30, 0.60) = 0.60
            worstRiskWeight: 0.60,
          },
        }],
      };
    },
  },
]);
