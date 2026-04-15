import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioLoanDetailsSlice } from "./index.js";

ProjectionSliceTester.run(portfolioLoanDetailsSlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = randomUUID();
      const loanId = randomUUID();
      // Key matches handler: `${portfolioId}:${loanId}`
      const key = `${portfolioId}:${loanId}`;
      const acquisitionDate = new Date("2024-06-01T00:00:00.000Z");
      const maturityDate = new Date("2029-06-01T00:00:00.000Z");
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanId,
              acquisitionDate,
              borrowerName: "Acme Corp",
              capitalRequirement: 50000,
              creditRating: "BBB",
              expectedLoss: 2500,
              interestRate: 0.045,
              loanAmount: 500000,
              maturityDate,
              probabilityOfDefault: 0.02,
              riskBand: "Medium",
              expectedPortfolioLoss: 10000,
              riskNarrative: "Moderate risk with stable outlook",
              simulatedDefaultRate: 0.025,
              tailRiskLoss: 50000,
              worstCaseLoss: 100000,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId,
              loanId,
              // acquisitionDate stored as ISO string (::text)
              acquisitionDate: acquisitionDate.toISOString(),
              borrowerName: "Acme Corp",
              capitalRequirement: 50000,
              creditRating: "BBB",
              expectedLoss: 2500,
              interestRate: 0.045,
              loanAmount: 500000,
              // maturityDate stored as ISO string (::text)
              maturityDate: maturityDate.toISOString(),
              probabilityOfDefault: 0.02,
              riskBand: "Medium",
              expectedPortfolioLoss: 10000,
              riskNarrative: "Moderate risk with stable outlook",
              simulatedDefaultRate: 0.025,
              tailRiskLoss: 50000,
              worstCaseLoss: 100000,
            },
          },
        ],
      };
    },
  },
]);
