import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioSummarySlice } from "./index.js";

ProjectionSliceTester.run(portfolioSummarySlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      // Single loan: portfolioId=PORT-01, loanAmount=1000, riskWeight=0.2, probabilityOfDefault=0.01
      const portfolioId = "PORT-01";
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            loanAmount: 1000,
            capitalRequirement: 80,
            expectedLoss: 10,
            riskWeight: 0.2,
            probabilityOfDefault: 0.01,
          } },
        ],
        then: [{ key: portfolioId, expectedState: {
          portfolioId: "PORT-01",
          totalLoans: 1,
          // totalExposure = loanAmount = 1000
          totalExposure: 1000,
          // totalCapitalRequirement = capitalRequirement = 80
          totalCapitalRequirement: 80,
          // totalExpectedLoss = expectedLoss = 10
          totalExpectedLoss: 10,
          // averageRiskWeight = riskWeight (single loan) = 0.2
          averageRiskWeight: 0.2,
          // averageProbabilityOfDefault = probabilityOfDefault (single loan) = 0.01
          averageProbabilityOfDefault: 0.01,
          // averageRating: 0.2 <= 0.25 → "AA"
          averageRating: "AA",
          // riskBand: 0.2 <= 0.55 → "Investment Grade"
          riskBand: "Investment Grade",
          // worstRiskWeight: only loan, riskWeight = 0.2
          worstRiskWeight: 0.2,
          // worstRating: 0.2 <= 0.25 → "AA"
          worstRating: "AA",
        } }],
      };
    },
  },
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      // Loan 1: loanAmount=1000, riskWeight=0.3, probabilityOfDefault=0.02
      // Loan 2: loanAmount=2000, riskWeight=0.6, probabilityOfDefault=0.05
      //
      // totalLoans = 1 + 1 = 2
      // totalExposure = 1000 + 2000 = 3000
      // totalCapitalRequirement = 80 + 200 = 280
      // totalExpectedLoss = 10 + 30 = 40
      // averageRiskWeight = (0.3*1000 + 0.6*2000) / (1000+2000) = (300+1200)/3000 = 1500/3000 = 0.5
      // averageProbabilityOfDefault = (0.02*1000 + 0.05*2000) / 3000 = (20+100)/3000 = 120/3000 = 0.04
      // averageRating: 0.5 <= 0.50 → "BBB"
      // riskBand: 0.5 <= 0.55 → "Investment Grade"
      // worstRiskWeight = max(0.3, 0.6) = 0.6
      // worstRating: 0.6 <= 0.75 → "BB"
      const portfolioId = "PORT-02";
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            loanAmount: 1000,
            capitalRequirement: 80,
            expectedLoss: 10,
            riskWeight: 0.3,
            probabilityOfDefault: 0.02,
          } },
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            loanAmount: 2000,
            capitalRequirement: 200,
            expectedLoss: 30,
            riskWeight: 0.6,
            probabilityOfDefault: 0.05,
          } },
        ],
        then: [{ key: portfolioId, expectedState: {
          portfolioId: "PORT-02",
          totalLoans: 2,
          totalExposure: 3000,
          totalCapitalRequirement: 280,
          totalExpectedLoss: 40,
          // averageRiskWeight = (0.3*1000 + 0.6*2000) / 3000 = 1500/3000 = 0.5
          averageRiskWeight: 0.5,
          // averageProbabilityOfDefault = (0.02*1000 + 0.05*2000) / 3000 = 120/3000 = 0.04
          averageProbabilityOfDefault: 0.04,
          // averageRating: 0.5 <= 0.50 → "BBB"
          averageRating: "BBB",
          // riskBand: 0.5 <= 0.55 → "Investment Grade"
          riskBand: "Investment Grade",
          // worstRiskWeight = max(0.3, 0.6) = 0.6 (loan 2 has higher riskWeight)
          worstRiskWeight: 0.6,
          // worstRating: 0.6 <= 0.75 → "BB"
          worstRating: "BB",
        } }],
      };
    },
  },
]);
