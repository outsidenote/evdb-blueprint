import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioLoanDetailsSlice } from "./index.js";

ProjectionSliceTester.run(portfolioLoanDetailsSlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = randomUUID();
      const loanId = randomUUID();
      const acquisitionDate = new Date("2024-06-15T10:00:00Z");
      const maturityDate = new Date("2029-06-15T10:00:00Z");

      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            loanId,
            acquisitionDate,
            borrowerName: "Acme Corp",
            capitalRequirement: 50000,
            creditRating: "BBB",
            expectedLoss: 1500,
            interestRate: 0.045,
            loanAmount: 500000,
            maturityDate,
            probabilityOfDefault: 0.03,
            riskBand: "Medium",
            expectedPortfolioLoss: 15000,
            riskNarrative: "Moderate risk based on industry trends",
            simulatedDefaultRate: 0.035,
            tailRiskLoss: 75000,
            worstCaseLoss: 100000,
          } },
        ],
        then: [{ key: portfolioId, expectedState: {
          portfolioId,
          loanId,
          // Date stored as ISO text via ::text cast, returned as string from jsonb
          acquisitionDate: acquisitionDate.toISOString(),
          borrowerName: "Acme Corp",
          // Numeric fields stored via ::numeric, returned as numbers from jsonb
          capitalRequirement: 50000,
          creditRating: "BBB",
          expectedLoss: 1500,
          interestRate: 0.045,
          loanAmount: 500000,
          // Date stored as ISO text via ::text cast, returned as string from jsonb
          maturityDate: maturityDate.toISOString(),
          probabilityOfDefault: 0.03,
          riskBand: "Medium",
          expectedPortfolioLoss: 15000,
          riskNarrative: "Moderate risk based on industry trends",
          simulatedDefaultRate: 0.035,
          tailRiskLoss: 75000,
          worstCaseLoss: 100000,
        } }],
      };
    },
  },
]);
