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
            acquisitionDate: new Date("2024-03-01T00:00:00Z"),
            borrowerName: "Acme Corp",
            capitalRequirement: 50000,
            creditRating: "BBB",
            expectedLoss: 5000,
            interestRate: 0.045,
            loanAmount: 1000000,
            maturityDate: new Date("2029-03-01T00:00:00Z"),
            probabilityOfDefault: 0.02,
            riskBand: "Medium",
            expectedPortfolioLoss: 4500,
            riskNarrative: "Moderate risk corporate borrower",
            simulatedDefaultRate: 0.025,
            tailRiskLoss: 80000,
            worstCaseLoss: 150000,
          } },
        ],
        then: [{ key, expectedState: {
          portfolioId,
          loanId,
          acquisitionDate: "2024-03-01T00:00:00.000Z",
          borrowerName: "Acme Corp",
          capitalRequirement: 50000,
          creditRating: "BBB",
          expectedLoss: 5000,
          interestRate: 0.045,
          loanAmount: 1000000,
          maturityDate: "2029-03-01T00:00:00.000Z",
          probabilityOfDefault: 0.02,
          riskBand: "Medium",
          expectedPortfolioLoss: 4500,
          riskNarrative: "Moderate risk corporate borrower",
          simulatedDefaultRate: 0.025,
          tailRiskLoss: 80000,
          worstCaseLoss: 150000,
        } }],
      };
    },
  },
]);
