import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioLoanDetailsSlice } from "../index.js";

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
            acquisitionDate: new Date("2025-01-01T11:00:00Z"),
            borrowerName: "test-borrowerName",
            capitalRequirement: "test-capitalRequirement",
            creditRating: "test-creditRating",
            expectedLoss: 0,
            interestRate: 0,
            loanAmount: 0,
            maturityDate: new Date("2025-01-01T11:00:00Z"),
            probabilityOfDefault: 0,
            riskBand: "test-riskBand",
            expectedPortfolioLoss: 0,
            riskNarrative: "test-riskNarrative",
            simulatedDefaultRate: 0,
            tailRiskLoss: 0,
            worstCaseLoss: 0,
          } },
        ],
        then: [{ key: `${portfolioId}:${loanId}`, expectedState: {
          portfolioId,
          loanId,
          acquisitionDate: "2025-01-01T11:00:00Z",
          borrowerName: "test-borrowerName",
          capitalRequirement: 0,
          creditRating: "test-creditRating",
          expectedLoss: 0,
          interestRate: 0,
          loanAmount: 0,
          maturityDate: "2025-01-01T11:00:00Z",
          probabilityOfDefault: 0,
          riskBand: "test-riskBand",
          expectedPortfolioLoss: 0,
          riskNarrative: "test-riskNarrative",
          simulatedDefaultRate: 0,
          tailRiskLoss: 0,
          worstCaseLoss: 0,
        } }],
      };
    },
  },
]);
