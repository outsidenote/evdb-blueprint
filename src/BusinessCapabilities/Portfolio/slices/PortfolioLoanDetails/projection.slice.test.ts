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
      const acquisitionDate = new Date("2024-03-15T00:00:00Z");
      const maturityDate = new Date("2034-03-15T00:00:00Z");
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            loanId,
            acquisitionDate,
            borrowerName: "Acme Corp",
            capitalRequirement: 850000,
            creditRating: "BBB",
            expectedLoss: 42000,
            interestRate: 0.065,
            loanAmount: 5000000,
            maturityDate,
            probabilityOfDefault: 0.03,
            riskBand: "Medium",
            expectedPortfolioLoss: 38000,
            riskNarrative: "Moderate risk profile with stable cash flows",
            simulatedDefaultRate: 0.028,
            tailRiskLoss: 120000,
            worstCaseLoss: 200000,
          } },
        ],
        then: [{ key, expectedState: {
          portfolioId,
          loanId,
          acquisitionDate: acquisitionDate.toISOString(),
          borrowerName: "Acme Corp",
          capitalRequirement: 850000,
          creditRating: "BBB",
          expectedLoss: 42000,
          interestRate: 0.065,
          loanAmount: 5000000,
          maturityDate: maturityDate.toISOString(),
          probabilityOfDefault: 0.03,
          riskBand: "Medium",
          expectedPortfolioLoss: 38000,
          riskNarrative: "Moderate risk profile with stable cash flows",
          simulatedDefaultRate: 0.028,
          tailRiskLoss: 120000,
          worstCaseLoss: 200000,
        } }],
      };
    },
  },
]);
