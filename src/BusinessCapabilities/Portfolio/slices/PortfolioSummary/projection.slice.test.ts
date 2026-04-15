import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioSummarySlice } from "./index.js";

ProjectionSliceTester.run(portfolioSummarySlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      // key = portfolioId (handler builds key as p.portfolioId)
      const key = "PORT-01";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-01",
              loanId: "LOAN-001",
              borrowerName: "Borrower A",
              loanAmount: 100000,
              capitalRequirement: 8000,
              expectedLoss: 500,
              probabilityOfDefault: 0.05,
              riskWeight: 0.30,
              creditRating: "A",
              acquisitionDate: new Date("2024-01-01"),
              maturityDate: new Date("2029-01-01"),
              interestRate: 0.04,
              riskBand: "Investment Grade",
              expectedPortfolioLoss: 1000,
              riskNarrative: "Low risk borrower",
              simulatedDefaultRate: 0.03,
              tailRiskLoss: 1500,
              worstCaseLoss: 2000,
            },
          },
        ],
        then: [{
          key,
          expectedState: {
            portfolioId: "PORT-01",
            // totalLoans = 1 (first event)
            totalLoans: 1,
            // totalExposure = loanAmount = 100000
            totalExposure: 100000,
            // totalCapitalRequirement = capitalRequirement = 8000
            totalCapitalRequirement: 8000,
            // totalExpectedLoss = expectedLoss = 500
            totalExpectedLoss: 500,
            // averageRiskWeight = riskWeight (single loan) = 0.30
            averageRiskWeight: 0.30,
            // averageProbabilityOfDefault = probabilityOfDefault (single loan) = 0.05
            averageProbabilityOfDefault: 0.05,
            // averageRating: 0.30 <= 0.35 → 'A'
            averageRating: "A",
            // riskBand: 0.30 <= 0.55 → 'Investment Grade'
            riskBand: "Investment Grade",
            // worstRating: single loan riskWeight=0.30 → 0.30 <= 0.35 → 'A'
            worstRating: "A",
          },
        }],
      };
    },
  },
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      // key = portfolioId (handler builds key as p.portfolioId)
      const key = "PORT-02";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-02",
              loanId: "LOAN-001",
              borrowerName: "Borrower A",
              loanAmount: 100000,
              capitalRequirement: 8000,
              expectedLoss: 500,
              probabilityOfDefault: 0.05,
              riskWeight: 0.30,
              creditRating: "A",
              acquisitionDate: new Date("2024-01-01"),
              maturityDate: new Date("2029-01-01"),
              interestRate: 0.04,
              riskBand: "Investment Grade",
              expectedPortfolioLoss: 1000,
              riskNarrative: "Low risk borrower",
              simulatedDefaultRate: 0.03,
              tailRiskLoss: 1500,
              worstCaseLoss: 2000,
            },
          },
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-02",
              loanId: "LOAN-002",
              borrowerName: "Borrower B",
              loanAmount: 200000,
              capitalRequirement: 24000,
              expectedLoss: 2000,
              probabilityOfDefault: 0.08,
              riskWeight: 0.60,
              creditRating: "BB",
              acquisitionDate: new Date("2024-02-01"),
              maturityDate: new Date("2029-02-01"),
              interestRate: 0.06,
              riskBand: "Speculative",
              expectedPortfolioLoss: 3000,
              riskNarrative: "Moderate risk borrower",
              simulatedDefaultRate: 0.07,
              tailRiskLoss: 5000,
              worstCaseLoss: 8000,
            },
          },
        ],
        then: [{
          key,
          expectedState: {
            portfolioId: "PORT-02",
            // totalLoans = 1 + 1 = 2
            totalLoans: 2,
            // totalExposure = 100000 + 200000 = 300000
            totalExposure: 300000,
            // totalCapitalRequirement = 8000 + 24000 = 32000
            totalCapitalRequirement: 32000,
            // totalExpectedLoss = 500 + 2000 = 2500
            totalExpectedLoss: 2500,
            // averageRiskWeight = weighted avg by loanAmount:
            // = (0.30 * 100000 + 0.60 * 200000) / (100000 + 200000)
            // = (30000 + 120000) / 300000 = 150000 / 300000 = 0.5
            averageRiskWeight: 0.5,
            // averageProbabilityOfDefault = weighted avg by loanAmount:
            // = (0.05 * 100000 + 0.08 * 200000) / 300000
            // = (5000 + 16000) / 300000 = 21000 / 300000 = 0.07
            averageProbabilityOfDefault: 0.07,
            // averageRating: averageRiskWeight=0.5, 0.5 <= 0.50 → 'BBB'
            averageRating: "BBB",
            // riskBand: averageRiskWeight=0.5, 0.5 <= 0.55 → 'Investment Grade'
            riskBand: "Investment Grade",
            // worstRating:
            // - After loan1 (riskWeight=0.30): worstRating='A' (boundary 0.35)
            // - loan2 riskWeight=0.60 > 0.35 (boundary for 'A') → update
            // - loan2 riskWeight=0.60: 0.60 <= 0.75 → 'BB'
            // → worstRating = 'BB'
            worstRating: "BB",
          },
        }],
      };
    },
  },
]);
