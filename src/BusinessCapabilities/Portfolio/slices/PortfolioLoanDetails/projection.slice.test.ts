import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioLoanDetailsSlice } from "./index.js";

ProjectionSliceTester.run(portfolioLoanDetailsSlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = randomUUID();
      const loanId = randomUUID();
      const acquisitionDate = new Date("2024-03-15T09:00:00Z");
      const maturityDate = new Date("2029-03-15T09:00:00Z");
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            loanId,
            acquisitionDate,
            borrowerName: "Acme Corp",
            capitalRequirement: 120000,
            creditRating: "A",
            expectedLoss: 2400,
            interestRate: 0.045,
            loanAmount: 400000,
            maturityDate,
            probabilityOfDefault: 0.015,
            riskBand: "Low",
            expectedPortfolioLoss: 8000,
            riskNarrative: "Low risk borrower with strong financials",
            simulatedDefaultRate: 0.02,
            tailRiskLoss: 20000,
            worstCaseLoss: 40000,
          } },
        ],
        then: [{ key: `${portfolioId}:${loanId}`, expectedState: {
          portfolioId,
          loanId,
          acquisitionDate: acquisitionDate.toISOString(),
          borrowerName: "Acme Corp",
          capitalRequirement: 120000,
          creditRating: "A",
          expectedLoss: 2400,
          interestRate: 0.045,
          loanAmount: 400000,
          maturityDate: maturityDate.toISOString(),
          probabilityOfDefault: 0.015,
          riskBand: "Low",
          expectedPortfolioLoss: 8000,
          riskNarrative: "Low risk borrower with strong financials",
          simulatedDefaultRate: 0.02,
          tailRiskLoss: 20000,
          worstCaseLoss: 40000,
        } }],
      };
    },
  },
]);
