import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioLoanDetailsSlice } from "../index.js";

ProjectionSliceTester.run(portfolioLoanDetailsSlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = randomUUID();
      const loanId = randomUUID();
      const acquisitionDate = new Date("2024-03-01T00:00:00Z");
      const maturityDate = new Date("2031-03-01T00:00:00Z");
      const key = `${portfolioId}:${loanId}`;
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanId,
              acquisitionDate,
              borrowerName: "Acme Corp",
              capitalRequirement: 1200000,
              creditRating: "BBB",
              expectedLoss: 36000,
              interestRate: 0.055,
              loanAmount: 1800000,
              maturityDate,
              probabilityOfDefault: 0.02,
              riskBand: "MEDIUM",
              expectedPortfolioLoss: 48000,
              riskNarrative: "Moderate credit risk with stable cash flows.",
              simulatedDefaultRate: 0.018,
              tailRiskLoss: 250000,
              worstCaseLoss: 420000,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId,
              loanId,
              acquisitionDate: acquisitionDate.toISOString(),
              borrowerName: "Acme Corp",
              capitalRequirement: 1200000,
              creditRating: "BBB",
              expectedLoss: 36000,
              interestRate: 0.055,
              loanAmount: 1800000,
              maturityDate: maturityDate.toISOString(),
              probabilityOfDefault: 0.02,
              riskBand: "MEDIUM",
              expectedPortfolioLoss: 48000,
              riskNarrative: "Moderate credit risk with stable cash flows.",
              simulatedDefaultRate: 0.018,
              tailRiskLoss: 250000,
              worstCaseLoss: 420000,
            },
          },
        ],
      };
    },
  },
]);
