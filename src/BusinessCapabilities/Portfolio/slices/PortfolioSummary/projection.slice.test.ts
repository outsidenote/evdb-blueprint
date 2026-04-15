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
              loanId: "LOAN-001",
              borrowerName: "Acme Corp",
              loanAmount: 10000,
              capitalRequirement: 1000,
              expectedLoss: 100,
              // riskWeight = 0.25 (enriched field added by AssessLoanRiskProcessor)
              riskWeight: 0.25,
              probabilityOfDefault: 0.05,
              creditRating: "AA",
              riskBand: "Investment Grade",
              interestRate: 0.03,
              acquisitionDate: new Date("2025-01-15"),
              maturityDate: new Date("2030-01-15"),
              expectedPortfolioLoss: 200,
              riskNarrative: "Low risk borrower",
              simulatedDefaultRate: 0.02,
              tailRiskLoss: 500,
              worstCaseLoss: 800,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId: "PORT-01",
              // totalLoans: first loan → 1
              totalLoans: 1,
              // totalExposure: loanAmount = 10000
              totalExposure: 10000,
              // totalCapitalRequirement: capitalRequirement = 1000
              totalCapitalRequirement: 1000,
              // totalExpectedLoss: expectedLoss = 100
              totalExpectedLoss: 100,
              // averageRiskWeight: single loan → riskWeight = 0.25
              averageRiskWeight: 0.25,
              // averageProbabilityOfDefault: single loan → probabilityOfDefault = 0.05
              averageProbabilityOfDefault: 0.05,
              // averageRating: 0.25 ≤ 0.25 → "AA"
              averageRating: "AA",
              // riskBand: 0.25 ≤ 0.55 → "Investment Grade"
              riskBand: "Investment Grade",
              // worstRating: only loan's creditRating = "AA"
              worstRating: "AA",
              // intermediate fields stored for accumulation
              // weightedRiskWeightSum: 0.25 * 10000 = 2500
              weightedRiskWeightSum: 2500,
              // weightedPodSum: 0.05 * 10000 = 500
              weightedPodSum: 500,
              // worstRiskWeight: first loan's riskWeight = 0.25
              worstRiskWeight: 0.25,
            },
          },
        ],
      };
    },
  },
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      // Event 1: riskWeight=0.25, loanAmount=10000 → weightedRW=2500, weightedPod=2500
      // Event 2: riskWeight=0.75, loanAmount=10000 → weightedRW=7500, weightedPod=7500
      // averageRiskWeight = (2500 + 7500) / (10000 + 10000) = 10000 / 20000 = 0.50
      // averageProbabilityOfDefault = (2500 + 7500) / 20000 = 0.50
      // averageRating: 0.50 ≤ 0.50 → "BBB"
      // riskBand: 0.50 ≤ 0.55 → "Investment Grade"
      // worstRating: riskWeight 0.75 > 0.25 → event 2's creditRating = "BB"
      const key = "PORT-02";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-02",
              loanId: "LOAN-001",
              borrowerName: "Alpha Inc",
              loanAmount: 10000,
              capitalRequirement: 500,
              expectedLoss: 50,
              riskWeight: 0.25,
              probabilityOfDefault: 0.25,
              creditRating: "AA",
              riskBand: "Investment Grade",
              interestRate: 0.03,
              acquisitionDate: new Date("2025-01-15"),
              maturityDate: new Date("2028-01-15"),
              expectedPortfolioLoss: 100,
              riskNarrative: "Very low risk",
              simulatedDefaultRate: 0.01,
              tailRiskLoss: 200,
              worstCaseLoss: 400,
            },
          },
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-02",
              loanId: "LOAN-002",
              borrowerName: "Beta Corp",
              loanAmount: 10000,
              capitalRequirement: 1500,
              expectedLoss: 150,
              riskWeight: 0.75,
              probabilityOfDefault: 0.75,
              creditRating: "BB",
              riskBand: "Speculative",
              interestRate: 0.08,
              acquisitionDate: new Date("2025-02-15"),
              maturityDate: new Date("2028-02-15"),
              expectedPortfolioLoss: 300,
              riskNarrative: "Moderate risk",
              simulatedDefaultRate: 0.05,
              tailRiskLoss: 800,
              worstCaseLoss: 1500,
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
              // totalExposure: 10000 + 10000 = 20000
              totalExposure: 20000,
              // totalCapitalRequirement: 500 + 1500 = 2000
              totalCapitalRequirement: 2000,
              // totalExpectedLoss: 50 + 150 = 200
              totalExpectedLoss: 200,
              // weightedRiskWeightSum: 0.25*10000 + 0.75*10000 = 2500 + 7500 = 10000
              weightedRiskWeightSum: 10000,
              // weightedPodSum: 0.25*10000 + 0.75*10000 = 2500 + 7500 = 10000
              weightedPodSum: 10000,
              // averageRiskWeight: 10000 / 20000 = 0.50
              averageRiskWeight: 0.5,
              // averageProbabilityOfDefault: 10000 / 20000 = 0.50
              averageProbabilityOfDefault: 0.5,
              // averageRating: 0.50 ≤ 0.50 → "BBB"
              averageRating: "BBB",
              // riskBand: 0.50 ≤ 0.55 → "Investment Grade"
              riskBand: "Investment Grade",
              // worstRating: event 2 riskWeight 0.75 > event 1 riskWeight 0.25 → event 2 creditRating = "BB"
              worstRating: "BB",
              // worstRiskWeight: max(0.25, 0.75) = 0.75
              worstRiskWeight: 0.75,
            },
          },
        ],
      };
    },
  },
]);
