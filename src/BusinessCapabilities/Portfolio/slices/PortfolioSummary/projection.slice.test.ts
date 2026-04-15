import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioSummarySlice } from "./index.js";

ProjectionSliceTester.run(portfolioSummarySlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      // Single BBB-rated loan:
      //   loanAmount = 100000, capitalRequirement = 4000, probabilityOfDefault = 0.002
      //   riskWeight = 4000 / (100000 * 0.08) = 0.50
      //   weightedPD = 0.002 * 100000 = 200
      // Derived:
      //   averageRiskWeight = 4000 / (100000 * 0.08) = 0.50
      //   averageProbabilityOfDefault = 200 / 100000 = 0.002
      //   averageRating: 0.50 ≤ 0.50 → "BBB"
      //   riskBand: 0.50 ≤ 0.55 → "Investment Grade"
      //   worstRating = "BBB" (only one loan)
      const key = "PORT-01";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-01",
              loanAmount: 100000,
              capitalRequirement: 4000,
              expectedLoss: 90,
              probabilityOfDefault: 0.002,
              creditRating: "BBB",
              loanId: "LOAN-01",
              borrowerName: "Acme Corp",
              interestRate: 0.05,
              acquisitionDate: new Date("2024-01-01"),
              maturityDate: new Date("2026-01-01"),
              riskBand: "Investment Grade - Medium",
              expectedPortfolioLoss: 90,
              riskNarrative: "BBB loan ($100000): Investment Grade - Medium.",
              simulatedDefaultRate: 0.002,
              tailRiskLoss: 100,
              worstCaseLoss: 100,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId: "PORT-01",
              totalLoans: 1,
              totalExposure: 100000,
              totalCapitalRequirement: 4000,
              totalExpectedLoss: 90,
              // totalWeightedPD = 0.002 * 100000 = 200
              totalWeightedPD: 200,
              // averageRiskWeight = 4000 / (100000 * 0.08) = 0.50
              averageRiskWeight: 0.5,
              // averageProbabilityOfDefault = 200 / 100000 = 0.002
              averageProbabilityOfDefault: 0.002,
              // averageRating: 0.50 ≤ 0.50 → "BBB"
              averageRating: "BBB",
              // riskBand: 0.50 ≤ 0.55 → "Investment Grade"
              riskBand: "Investment Grade",
              // worstRating = creditRating of the single (highest-risk) loan = "BBB"
              worstRating: "BBB",
              worstRiskWeight: 0.5,
            },
          },
        ],
      };
    },
  },
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      // Event 1 — BBB loan:
      //   loanAmount=100000, capitalRequirement=4000, probabilityOfDefault=0.002, creditRating="BBB"
      //   riskWeight1 = 4000 / (100000 * 0.08) = 0.50
      //   weightedPD1 = 0.002 * 100000 = 200
      // Event 2 — BB loan:
      //   loanAmount=100000, capitalRequirement=6000, probabilityOfDefault=0.010, creditRating="BB"
      //   riskWeight2 = 6000 / (100000 * 0.08) = 0.75
      //   weightedPD2 = 0.010 * 100000 = 1000
      // Accumulated:
      //   totalLoans = 2
      //   totalExposure = 200000
      //   totalCapitalRequirement = 10000
      //   totalExpectedLoss = 90 + 450 = 540
      //   totalWeightedPD = 200 + 1000 = 1200
      // Derived:
      //   averageRiskWeight = 10000 / (200000 * 0.08) = 10000 / 16000 = 0.625
      //   averageProbabilityOfDefault = 1200 / 200000 = 0.006
      //   averageRating: 0.50 < 0.625 ≤ 0.75 → "BB"
      //   riskBand: 0.625 > 0.55 → "Speculative"
      //   worstRiskWeight = max(0.50, 0.75) = 0.75 (BB loan)
      //   worstRating = "BB" (creditRating of loan with riskWeight 0.75)
      const key = "PORT-02";
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-02",
              loanAmount: 100000,
              capitalRequirement: 4000,
              expectedLoss: 90,
              probabilityOfDefault: 0.002,
              creditRating: "BBB",
              loanId: "LOAN-01",
              borrowerName: "Acme Corp",
              interestRate: 0.05,
              acquisitionDate: new Date("2024-01-01"),
              maturityDate: new Date("2026-01-01"),
              riskBand: "Investment Grade - Medium",
              expectedPortfolioLoss: 90,
              riskNarrative: "BBB loan ($100000): Investment Grade - Medium.",
              simulatedDefaultRate: 0.002,
              tailRiskLoss: 100,
              worstCaseLoss: 100,
            },
          },
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId: "PORT-02",
              loanAmount: 100000,
              capitalRequirement: 6000,
              // expectedLoss = 100000 * 0.010 * 0.45 = 450
              expectedLoss: 450,
              probabilityOfDefault: 0.010,
              creditRating: "BB",
              loanId: "LOAN-02",
              borrowerName: "Globex Corp",
              interestRate: 0.08,
              acquisitionDate: new Date("2024-01-15"),
              maturityDate: new Date("2027-01-15"),
              riskBand: "Speculative - High",
              expectedPortfolioLoss: 450,
              riskNarrative: "BB loan ($100000): Speculative - High.",
              simulatedDefaultRate: 0.010,
              tailRiskLoss: 500,
              worstCaseLoss: 500,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId: "PORT-02",
              totalLoans: 2,
              totalExposure: 200000,
              totalCapitalRequirement: 10000,
              // 90 + 450 = 540
              totalExpectedLoss: 540,
              // 200 + 1000 = 1200
              totalWeightedPD: 1200,
              // 10000 / (200000 * 0.08) = 10000 / 16000 = 0.625
              averageRiskWeight: 0.625,
              // 1200 / 200000 = 0.006
              averageProbabilityOfDefault: 0.006,
              // 0.50 < 0.625 ≤ 0.75 → "BB"
              averageRating: "BB",
              // 0.625 > 0.55 → "Speculative"
              riskBand: "Speculative",
              // max(0.50, 0.75) = 0.75 — BB loan has the worst (highest) risk weight
              worstRiskWeight: 0.75,
              worstRating: "BB",
            },
          },
        ],
      };
    },
  },
]);
