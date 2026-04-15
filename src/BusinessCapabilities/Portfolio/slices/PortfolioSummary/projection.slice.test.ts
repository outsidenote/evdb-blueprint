import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioSummarySlice } from "./index.js";

ProjectionSliceTester.run(portfolioSummarySlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      // Event: portfolioId=PORT-01, loanAmount=10000, riskWeight=0.3, probabilityOfDefault=0.04
      //
      // totalLoans: 1
      // totalExposure: 10000
      // totalCapitalRequirement: 1000
      // totalExpectedLoss: 12
      // weightedRiskWeightSum: 0.3 * 10000 = 3000
      // weightedPdSum: 0.04 * 10000 = 400
      // worstRiskWeight: GREATEST(0, 0.3) = 0.3
      // averageRiskWeight: 3000 / 10000 = 0.3
      // averageProbabilityOfDefault: 400 / 10000 = 0.04
      // averageRating: 0.3 <= 0.25? No | 0.3 <= 0.35? Yes → 'A'
      // riskBand: 0.3 <= 0.55? Yes → 'Investment Grade'
      // worstRating: 0.3 <= 0.35 → 'A'
      const key = "PORT-01";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-01",
              loanAmount: 10000,
              capitalRequirement: 1000,
              expectedLoss: 12,
              riskWeight: 0.3,
              probabilityOfDefault: 0.04,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId: "PORT-01",
              totalLoans: 1,
              totalExposure: 10000,
              totalCapitalRequirement: 1000,
              totalExpectedLoss: 12,
              // weightedRiskWeightSum: 0.3 * 10000 = 3000
              weightedRiskWeightSum: 3000,
              // weightedPdSum: 0.04 * 10000 = 400
              weightedPdSum: 400,
              worstRiskWeight: 0.3,
              // averageRiskWeight: 3000 / 10000 = 0.3
              averageRiskWeight: 0.3,
              // averageProbabilityOfDefault: 400 / 10000 = 0.04
              averageProbabilityOfDefault: 0.04,
              // averageRating: 0.3 <= 0.25? No | 0.3 <= 0.35? Yes → 'A'
              averageRating: "A",
              // riskBand: 0.3 <= 0.55 → 'Investment Grade'
              riskBand: "Investment Grade",
              // worstRating: 0.3 <= 0.35 → 'A'
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
      // Event 1: portfolioId=PORT-02, loanAmount=8000, riskWeight=0.2, probabilityOfDefault=0.03
      // Event 2: portfolioId=PORT-02, loanAmount=12000, riskWeight=0.6, probabilityOfDefault=0.08
      //
      // totalLoans: 1 + 1 = 2
      // totalExposure: 8000 + 12000 = 20000
      // totalCapitalRequirement: 800 + 1200 = 2000
      // totalExpectedLoss: 10 + 15 = 25
      // weightedRiskWeightSum: (0.2 * 8000) + (0.6 * 12000) = 1600 + 7200 = 8800
      // weightedPdSum: (0.03 * 8000) + (0.08 * 12000) = 240 + 960 = 1200
      // worstRiskWeight: GREATEST(0.2, 0.6) = 0.6
      // averageRiskWeight: 8800 / 20000 = 0.44
      // averageProbabilityOfDefault: 1200 / 20000 = 0.06
      // averageRating: 0.44 <= 0.25? No | 0.44 <= 0.35? No | 0.44 <= 0.50? Yes → 'BBB'
      // riskBand: 0.44 <= 0.55 → 'Investment Grade'
      // worstRating: 0.6 <= 0.25? No | 0.6 <= 0.35? No | 0.6 <= 0.50? No | 0.6 <= 0.75? Yes → 'BB'
      const key = "PORT-02";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-02",
              loanAmount: 8000,
              capitalRequirement: 800,
              expectedLoss: 10,
              riskWeight: 0.2,
              probabilityOfDefault: 0.03,
            },
          },
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-02",
              loanAmount: 12000,
              capitalRequirement: 1200,
              expectedLoss: 15,
              riskWeight: 0.6,
              probabilityOfDefault: 0.08,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId: "PORT-02",
              // totalLoans: 1 + 1 = 2
              totalLoans: 2,
              // totalExposure: 8000 + 12000 = 20000
              totalExposure: 20000,
              // totalCapitalRequirement: 800 + 1200 = 2000
              totalCapitalRequirement: 2000,
              // totalExpectedLoss: 10 + 15 = 25
              totalExpectedLoss: 25,
              // weightedRiskWeightSum: (0.2 * 8000) + (0.6 * 12000) = 1600 + 7200 = 8800
              weightedRiskWeightSum: 8800,
              // weightedPdSum: (0.03 * 8000) + (0.08 * 12000) = 240 + 960 = 1200
              weightedPdSum: 1200,
              // worstRiskWeight: GREATEST(0.2, 0.6) = 0.6
              worstRiskWeight: 0.6,
              // averageRiskWeight: 8800 / 20000 = 0.44
              averageRiskWeight: 0.44,
              // averageProbabilityOfDefault: 1200 / 20000 = 0.06
              averageProbabilityOfDefault: 0.06,
              // averageRating: 0.44 <= 0.50 → 'BBB'
              averageRating: "BBB",
              // riskBand: 0.44 <= 0.55 → 'Investment Grade'
              riskBand: "Investment Grade",
              // worstRating: 0.6 <= 0.75 → 'BB'
              worstRating: "BB",
            },
          },
        ],
      };
    },
  },
]);
