import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioSummarySlice } from "./index.js";

ProjectionSliceTester.run(portfolioSummarySlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = randomUUID();
      const key = portfolioId; // projection key IS portfolioId

      // A-rated loan: baseRiskWeight = 0.35 (Basel III), maturity within 5 years (no adjustment)
      // capitalRequirement = 100000 × 0.35 × 0.08 = 2800
      // PD = 0.0005 (PD_MAP for A), LGD = 0.45
      // expectedLoss = 100000 × 0.0005 × 0.45 = 22.5
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanId: "LOAN-001",
              borrowerName: "Alpha Corp",
              creditRating: "A",
              loanAmount: 100000,
              capitalRequirement: 2800,
              expectedLoss: 22.5,
              probabilityOfDefault: 0.0005,
              interestRate: 0.05,
              acquisitionDate: new Date("2024-01-01"),
              maturityDate: new Date("2026-01-01"),
              riskBand: "Investment Grade - Medium",
              expectedPortfolioLoss: 50,
              riskNarrative: "A rated loan",
              simulatedDefaultRate: 0.001,
              tailRiskLoss: 0,
              worstCaseLoss: 0,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId,
              // totalLoans: 1 (first event)
              totalLoans: 1,
              // totalExposure = loanAmount = 100000
              totalExposure: 100000,
              // totalCapitalRequirement = capitalRequirement = 2800
              totalCapitalRequirement: 2800,
              // totalExpectedLoss = expectedLoss = 22.5
              totalExpectedLoss: 22.5,
              // weightedPDSum = loanAmount × PD = 100000 × 0.0005 = 50
              weightedPDSum: 50,
              // riskWeight = capitalRequirement / (loanAmount × 0.08) = 2800 / 8000 = 0.35
              worstRiskWeight: 0.35,
              // worstRating = creditRating of worst loan by riskWeight = "A"
              worstRating: "A",
              // averageRiskWeight = totalCapitalRequirement / (totalExposure × 0.08) = 2800 / 8000 = 0.35
              averageRiskWeight: 0.35,
              // averageProbabilityOfDefault = weightedPDSum / totalExposure = 50 / 100000 = 0.0005
              averageProbabilityOfDefault: 0.0005,
              // averageRating: 0.35 ≤ 0.35 → "A"
              averageRating: "A",
              // riskBand: 0.35 ≤ 0.55 → "Investment Grade"
              riskBand: "Investment Grade",
            },
          },
        ],
      };
    },
  },
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      const portfolioId = randomUUID();
      const key = portfolioId; // projection key IS portfolioId

      // Event 1: A-rated loan, loanAmount=100000
      //   riskWeight = 2800 / (100000 × 0.08) = 0.35
      //   weightedPD = 100000 × 0.0005 = 50
      //
      // Event 2: BBB-rated loan, loanAmount=200000
      //   capitalRequirement = 200000 × 0.50 × 0.08 = 8000
      //   riskWeight = 8000 / (200000 × 0.08) = 0.50
      //   PD = 0.002 (PD_MAP for BBB), weightedPD = 200000 × 0.002 = 400
      //   expectedLoss = 200000 × 0.002 × 0.45 = 180
      //
      // After two events:
      //   totalLoans:              1 + 1 = 2
      //   totalExposure:           100000 + 200000 = 300000
      //   totalCapitalRequirement: 2800 + 8000 = 10800
      //   totalExpectedLoss:       22.5 + 180 = 202.5
      //   weightedPDSum:           50 + 400 = 450
      //   averageRiskWeight:       10800 / (300000 × 0.08) = 10800 / 24000 = 0.45
      //   averagePD:               450 / 300000 = 0.0015
      //   averageRating:           0.45 ≤ 0.50 → "BBB"
      //   riskBand:                0.45 ≤ 0.55 → "Investment Grade"
      //   worstRating:             BBB riskWeight 0.50 > A riskWeight 0.35 → "BBB"
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanId: "LOAN-001",
              borrowerName: "Alpha Corp",
              creditRating: "A",
              loanAmount: 100000,
              capitalRequirement: 2800,
              expectedLoss: 22.5,
              probabilityOfDefault: 0.0005,
              interestRate: 0.05,
              acquisitionDate: new Date("2024-01-01"),
              maturityDate: new Date("2026-01-01"),
              riskBand: "Investment Grade - Medium",
              expectedPortfolioLoss: 50,
              riskNarrative: "A rated loan",
              simulatedDefaultRate: 0.001,
              tailRiskLoss: 0,
              worstCaseLoss: 0,
            },
          },
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanId: "LOAN-002",
              borrowerName: "Beta Corp",
              creditRating: "BBB",
              loanAmount: 200000,
              capitalRequirement: 8000,
              expectedLoss: 180,
              probabilityOfDefault: 0.002,
              interestRate: 0.07,
              acquisitionDate: new Date("2024-01-01"),
              maturityDate: new Date("2027-01-01"),
              riskBand: "Investment Grade - Medium",
              expectedPortfolioLoss: 200,
              riskNarrative: "BBB rated loan",
              simulatedDefaultRate: 0.003,
              tailRiskLoss: 0,
              worstCaseLoss: 0,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId,
              totalLoans: 2,
              totalExposure: 300000,
              totalCapitalRequirement: 10800,
              // totalExpectedLoss: 22.5 + 180 = 202.5
              totalExpectedLoss: 202.5,
              // weightedPDSum: 100000×0.0005 + 200000×0.002 = 50 + 400 = 450
              weightedPDSum: 450,
              // worstRiskWeight: BBB=0.50 > A=0.35 → 0.50
              worstRiskWeight: 0.5,
              worstRating: "BBB",
              // averageRiskWeight: 10800 / (300000 × 0.08) = 10800 / 24000 = 0.45
              averageRiskWeight: 0.45,
              // averageProbabilityOfDefault: 450 / 300000 = 0.0015
              averageProbabilityOfDefault: 0.0015,
              // averageRating: 0.45 ≤ 0.50 → "BBB"
              averageRating: "BBB",
              // riskBand: 0.45 ≤ 0.55 → "Investment Grade"
              riskBand: "Investment Grade",
            },
          },
        ],
      };
    },
  },
]);
