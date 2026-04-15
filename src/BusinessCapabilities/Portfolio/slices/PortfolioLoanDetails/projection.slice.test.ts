import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioLoanDetailsSlice } from "./index.js";

ProjectionSliceTester.run(portfolioLoanDetailsSlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = randomUUID();
      const loanId = randomUUID();
      // Key matches projection handler: portfolioId:loanId
      const key = `${portfolioId}:${loanId}`;
      const acquisitionDate = new Date("2024-03-01T00:00:00Z");
      const maturityDate = new Date("2030-03-01T00:00:00Z");
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            loanId,
            acquisitionDate,
            borrowerName: "Meridian Capital LLC",
            capitalRequirement: 120000,
            creditRating: "BBB+",
            expectedLoss: 9000,
            interestRate: 0.052,
            loanAmount: 600000,
            maturityDate,
            probabilityOfDefault: 0.015,
            riskBand: "Medium",
            expectedPortfolioLoss: 4500,
            riskNarrative: "Stable borrower with moderate leverage",
            simulatedDefaultRate: 0.018,
            tailRiskLoss: 18000,
            worstCaseLoss: 30000,
          } },
        ],
        then: [{ key, expectedState: {
          // All fields are overwritten on each event (no accumulation)
          portfolioId,
          loanId,
          // Date stored as ISO string (toISOString() in handler)
          acquisitionDate: acquisitionDate.toISOString(),
          borrowerName: "Meridian Capital LLC",
          capitalRequirement: 120000,
          creditRating: "BBB+",
          expectedLoss: 9000,
          interestRate: 0.052,
          loanAmount: 600000,
          // Date stored as ISO string
          maturityDate: maturityDate.toISOString(),
          probabilityOfDefault: 0.015,
          riskBand: "Medium",
          expectedPortfolioLoss: 4500,
          riskNarrative: "Stable borrower with moderate leverage",
          simulatedDefaultRate: 0.018,
          tailRiskLoss: 18000,
          worstCaseLoss: 30000,
        } }],
      };
    },
  },
]);
