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
      const acquisitionDate = new Date("2024-03-01T00:00:00Z");
      const maturityDate = new Date("2034-03-01T00:00:00Z");

      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanId,
              acquisitionDate,
              borrowerName: "Acme Corp",
              capitalRequirement: 120000,
              creditRating: "BBB",
              expectedLoss: 15000,
              interestRate: 0.045,
              loanAmount: 500000,
              maturityDate,
              probabilityOfDefault: 0.03,
              riskBand: "Medium",
              expectedPortfolioLoss: 18000,
              riskNarrative: "Stable borrower with moderate leverage",
              simulatedDefaultRate: 0.025,
              tailRiskLoss: 45000,
              worstCaseLoss: 60000,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId,
              loanId,
              borrowerName: "Acme Corp",
              capitalRequirement: 120000,
              creditRating: "BBB",
              expectedLoss: 15000,
              interestRate: 0.045,
              loanAmount: 500000,
              probabilityOfDefault: 0.03,
              riskBand: "Medium",
              expectedPortfolioLoss: 18000,
              riskNarrative: "Stable borrower with moderate leverage",
              simulatedDefaultRate: 0.025,
              tailRiskLoss: 45000,
              worstCaseLoss: 60000,
            },
          },
        ],
      };
    },
  },
]);
