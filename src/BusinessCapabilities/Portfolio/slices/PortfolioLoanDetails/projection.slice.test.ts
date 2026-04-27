import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioLoanDetailsSlice } from "./index.js";

ProjectionSliceTester.run(portfolioLoanDetailsSlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = randomUUID();
      const loanId = randomUUID();
      const key = `${portfolioId}:${loanId}`;
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            loanId,
            acquisitionDate: new Date("2024-06-01T09:00:00Z"),
            borrowerName: "Acme Corp",
            capitalRequirement: 250000,
            creditRating: "BBB",
            expectedLoss: 15000,
            interestRate: 0.065,
            loanAmount: 1000000,
            maturityDate: new Date("2029-06-01T09:00:00Z"),
            probabilityOfDefault: 0.03,
            riskBand: "Medium",
            expectedPortfolioLoss: 30000,
            riskNarrative: "Standard credit risk with moderate exposure",
            simulatedDefaultRate: 0.025,
            tailRiskLoss: 120000,
            worstCaseLoss: 200000,
          } },
        ],
        then: [{ key, expectedState: {
          portfolioId,
          loanId,
          // Dates are stored as ISO strings in jsonb
          acquisitionDate: "2024-06-01T09:00:00.000Z",
          borrowerName: "Acme Corp",
          capitalRequirement: 250000,
          creditRating: "BBB",
          expectedLoss: 15000,
          interestRate: 0.065,
          loanAmount: 1000000,
          maturityDate: "2029-06-01T09:00:00.000Z",
          probabilityOfDefault: 0.03,
          riskBand: "Medium",
          expectedPortfolioLoss: 30000,
          riskNarrative: "Standard credit risk with moderate exposure",
          simulatedDefaultRate: 0.025,
          tailRiskLoss: 120000,
          worstCaseLoss: 200000,
        } }],
      };
    },
  },
]);
