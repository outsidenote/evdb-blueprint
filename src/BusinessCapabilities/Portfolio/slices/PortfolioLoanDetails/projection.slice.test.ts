import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioLoanDetailsSlice } from "./index.js";

ProjectionSliceTester.run(portfolioLoanDetailsSlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = randomUUID();
      const loanId = randomUUID();
      const acquisitionDate = new Date("2025-03-01T00:00:00.000Z");
      const maturityDate = new Date("2030-03-01T00:00:00.000Z");
      const key = `${portfolioId}:${loanId}`;
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            loanId,
            acquisitionDate,
            borrowerName: "Acme Corp",
            capitalRequirement: 50000,
            creditRating: "BBB",
            expectedLoss: 2500,
            interestRate: 0.065,
            loanAmount: 500000,
            maturityDate,
            probabilityOfDefault: 0.02,
            riskBand: "Medium",
            expectedPortfolioLoss: 12500,
            riskNarrative: "Moderate risk with stable cash flows",
            simulatedDefaultRate: 0.025,
            tailRiskLoss: 75000,
            worstCaseLoss: 150000,
          } },
        ],
        then: [{ key, expectedState: {
          // All string/text fields come back as strings from jsonb
          // All numeric fields stored as ::numeric come back as numbers from jsonb
          // Date fields stored as ::text ISO strings come back as strings
          portfolioId,
          loanId,
          acquisitionDate: acquisitionDate.toISOString(),
          borrowerName: "Acme Corp",
          capitalRequirement: 50000,
          creditRating: "BBB",
          expectedLoss: 2500,
          interestRate: 0.065,
          loanAmount: 500000,
          maturityDate: maturityDate.toISOString(),
          probabilityOfDefault: 0.02,
          riskBand: "Medium",
          expectedPortfolioLoss: 12500,
          riskNarrative: "Moderate risk with stable cash flows",
          simulatedDefaultRate: 0.025,
          tailRiskLoss: 75000,
          worstCaseLoss: 150000,
        } }],
      };
    },
  },
]);
