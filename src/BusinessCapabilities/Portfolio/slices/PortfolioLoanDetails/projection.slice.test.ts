import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioLoanDetailsSlice } from "./index.js";

ProjectionSliceTester.run(portfolioLoanDetailsSlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = randomUUID();
      const loanId = randomUUID();
      const acquisitionDate = new Date("2024-06-15T00:00:00.000Z");
      const maturityDate = new Date("2029-06-15T00:00:00.000Z");
      const key = `${portfolioId}:${loanId}`;
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            loanId,
            acquisitionDate,
            borrowerName: "Jane Doe",
            capitalRequirement: 50000,
            creditRating: "BBB",
            expectedLoss: 2500,
            interestRate: 0.055,
            loanAmount: 500000,
            maturityDate,
            probabilityOfDefault: 0.03,
            riskBand: "Medium",
            expectedPortfolioLoss: 15000,
            riskNarrative: "Moderate risk profile with stable repayment history.",
            simulatedDefaultRate: 0.025,
            tailRiskLoss: 75000,
            worstCaseLoss: 100000,
          } },
        ],
        then: [{ key, expectedState: {
          portfolioId,
          loanId,
          acquisitionDate: acquisitionDate.toISOString(),
          borrowerName: "Jane Doe",
          capitalRequirement: 50000,
          creditRating: "BBB",
          expectedLoss: 2500,
          interestRate: 0.055,
          loanAmount: 500000,
          maturityDate: maturityDate.toISOString(),
          probabilityOfDefault: 0.03,
          riskBand: "Medium",
          expectedPortfolioLoss: 15000,
          riskNarrative: "Moderate risk profile with stable repayment history.",
          simulatedDefaultRate: 0.025,
          tailRiskLoss: 75000,
          worstCaseLoss: 100000,
        } }],
      };
    },
  },
]);
