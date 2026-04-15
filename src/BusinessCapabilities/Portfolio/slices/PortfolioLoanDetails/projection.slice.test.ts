import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioLoanDetailsSlice } from "./index.js";

ProjectionSliceTester.run(portfolioLoanDetailsSlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = randomUUID();
      const loanId = randomUUID();
      // Key matches how the handler builds it: portfolioId:loanId
      const key = `${portfolioId}:${loanId}`;
      const acquisitionDate = new Date("2024-03-01T00:00:00Z");
      const maturityDate = new Date("2029-03-01T00:00:00Z");
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
              creditRating: "BB+",
              expectedLoss: 2500,
              interestRate: 0.055,
              loanAmount: 500000,
              maturityDate,
              probabilityOfDefault: 0.03,
              riskBand: "Medium",
              expectedPortfolioLoss: 15000,
              riskNarrative: "Stable borrower with moderate risk",
              simulatedDefaultRate: 0.025,
              tailRiskLoss: 75000,
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
              // Dates stored as ISO strings in jsonb
              acquisitionDate: acquisitionDate.toISOString(),
              borrowerName: "Acme Corp",
              capitalRequirement: 50000,
              creditRating: "BB+",
              expectedLoss: 2500,
              interestRate: 0.055,
              loanAmount: 500000,
              maturityDate: maturityDate.toISOString(),
              probabilityOfDefault: 0.03,
              riskBand: "Medium",
              expectedPortfolioLoss: 15000,
              riskNarrative: "Stable borrower with moderate risk",
              simulatedDefaultRate: 0.025,
              tailRiskLoss: 75000,
              worstCaseLoss: 100000,
            },
          },
        ],
      };
    },
  },
]);
