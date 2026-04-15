import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioLoanDetailsSlice } from "./index.js";

ProjectionSliceTester.run(portfolioLoanDetailsSlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = randomUUID();
      const loanId = randomUUID();
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            loanId,
            acquisitionDate: new Date("2025-03-01T00:00:00.000Z"),
            borrowerName: "Alice Smith",
            capitalRequirement: 50000,
            creditRating: "BBB",
            expectedLoss: 1500,
            interestRate: 5.5,
            loanAmount: 100000,
            maturityDate: new Date("2030-03-01T00:00:00.000Z"),
            probabilityOfDefault: 0.03,
            riskBand: "Medium",
            expectedPortfolioLoss: 3000,
            riskNarrative: "Moderate risk borrower with stable income",
            simulatedDefaultRate: 0.025,
            tailRiskLoss: 8000,
            worstCaseLoss: 15000,
          } },
        ],
        then: [{ key: portfolioId, expectedState: {
          portfolioId,
          loanId,
          // Date stored as ISO string per Date->toISOString() conversion in handler
          acquisitionDate: "2025-03-01T00:00:00.000Z",
          borrowerName: "Alice Smith",
          // capitalRequirement: 50000 stored as numeric
          capitalRequirement: 50000,
          creditRating: "BBB",
          // expectedLoss: 1500 stored as numeric
          expectedLoss: 1500,
          // interestRate: 5.5 stored as numeric
          interestRate: 5.5,
          // loanAmount: 100000 stored as numeric
          loanAmount: 100000,
          // Date stored as ISO string per Date->toISOString() conversion in handler
          maturityDate: "2030-03-01T00:00:00.000Z",
          // probabilityOfDefault: 0.03 stored as numeric
          probabilityOfDefault: 0.03,
          riskBand: "Medium",
          // expectedPortfolioLoss: 3000 stored as numeric
          expectedPortfolioLoss: 3000,
          riskNarrative: "Moderate risk borrower with stable income",
          // simulatedDefaultRate: 0.025 stored as numeric
          simulatedDefaultRate: 0.025,
          // tailRiskLoss: 8000 stored as numeric
          tailRiskLoss: 8000,
          // worstCaseLoss: 15000 stored as numeric
          worstCaseLoss: 15000,
        } }],
      };
    },
  },
]);
