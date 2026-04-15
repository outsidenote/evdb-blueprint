import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioLoanDetailsSlice } from "./index.js";

ProjectionSliceTester.run(portfolioLoanDetailsSlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = randomUUID();
      const loanId = randomUUID();
      const acquisitionDate = new Date("2024-03-15T00:00:00Z");
      const maturityDate = new Date("2034-03-15T00:00:00Z");
      const key = `${portfolioId}:${loanId}`;
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            loanId,
            acquisitionDate,
            borrowerName: "Acme Corp",
            capitalRequirement: 125000,
            creditRating: "BBB",
            expectedLoss: 8500,
            interestRate: 0.045,
            loanAmount: 1000000,
            maturityDate,
            probabilityOfDefault: 0.012,
            riskBand: "Medium",
            expectedPortfolioLoss: 10200,
            riskNarrative: "Borrower shows moderate credit risk with stable cash flows.",
            simulatedDefaultRate: 0.018,
            tailRiskLoss: 95000,
            worstCaseLoss: 150000,
          } },
        ],
        then: [{ key, expectedState: {
          portfolioId,
          loanId,
          acquisitionDate: acquisitionDate.toISOString(),
          borrowerName: "Acme Corp",
          capitalRequirement: 125000,
          creditRating: "BBB",
          expectedLoss: 8500,
          interestRate: 0.045,
          loanAmount: 1000000,
          maturityDate: maturityDate.toISOString(),
          probabilityOfDefault: 0.012,
          riskBand: "Medium",
          expectedPortfolioLoss: 10200,
          riskNarrative: "Borrower shows moderate credit risk with stable cash flows.",
          simulatedDefaultRate: 0.018,
          tailRiskLoss: 95000,
          worstCaseLoss: 150000,
        } }],
      };
    },
  },
]);
