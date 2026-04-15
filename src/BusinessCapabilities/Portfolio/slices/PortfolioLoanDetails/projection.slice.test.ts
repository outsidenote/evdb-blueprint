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
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              loanId,
              acquisitionDate,
              borrowerName: "Acme Corp",
              capitalRequirement: 50000,
              creditRating: "BBB",
              expectedLoss: 1200.5,
              interestRate: 0.045,
              loanAmount: 250000,
              maturityDate,
              probabilityOfDefault: 0.03,
              riskBand: "MEDIUM",
              expectedPortfolioLoss: 7500,
              riskNarrative: "Moderate risk based on sector exposure",
              simulatedDefaultRate: 0.025,
              tailRiskLoss: 15000,
              worstCaseLoss: 20000,
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
              capitalRequirement: 50000,
              creditRating: "BBB",
              expectedLoss: 1200.5,
              interestRate: 0.045,
              loanAmount: 250000,
              maturityDate: maturityDate.toISOString(),
              probabilityOfDefault: 0.03,
              riskBand: "MEDIUM",
              expectedPortfolioLoss: 7500,
              riskNarrative: "Moderate risk based on sector exposure",
              simulatedDefaultRate: 0.025,
              tailRiskLoss: 15000,
              worstCaseLoss: 20000,
            },
          },
        ],
      };
    },
  },
  {
    description: "LoanRiskAssessed: second event overwrites existing state",
    run: () => {
      const portfolioId = randomUUID();
      const loanId = randomUUID();
      const acquisitionDate = new Date("2025-03-01T00:00:00.000Z");
      const maturityDate = new Date("2030-03-01T00:00:00.000Z");
      const key = `${portfolioId}:${loanId}`;
      const sharedPayload = {
        portfolioId,
        loanId,
        acquisitionDate,
        borrowerName: "Acme Corp",
        capitalRequirement: 50000,
        creditRating: "BBB",
        expectedLoss: 1200.5,
        interestRate: 0.045,
        loanAmount: 250000,
        maturityDate,
        probabilityOfDefault: 0.03,
        riskBand: "MEDIUM",
        expectedPortfolioLoss: 7500,
        riskNarrative: "Initial assessment",
        simulatedDefaultRate: 0.025,
        tailRiskLoss: 15000,
        worstCaseLoss: 20000,
      };
      const updatedPayload = {
        ...sharedPayload,
        creditRating: "BB",
        riskBand: "HIGH",
        probabilityOfDefault: 0.08,
        expectedLoss: 4500,
        expectedPortfolioLoss: 18000,
        riskNarrative: "Downgraded after sector stress test",
        simulatedDefaultRate: 0.07,
        tailRiskLoss: 35000,
        worstCaseLoss: 50000,
      };
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: sharedPayload },
          { messageType: "LoanRiskAssessed", payload: updatedPayload },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId,
              loanId,
              acquisitionDate: acquisitionDate.toISOString(),
              borrowerName: "Acme Corp",
              capitalRequirement: 50000,
              creditRating: "BB",
              expectedLoss: 4500,
              interestRate: 0.045,
              loanAmount: 250000,
              maturityDate: maturityDate.toISOString(),
              probabilityOfDefault: 0.08,
              riskBand: "HIGH",
              expectedPortfolioLoss: 18000,
              riskNarrative: "Downgraded after sector stress test",
              simulatedDefaultRate: 0.07,
              tailRiskLoss: 35000,
              worstCaseLoss: 50000,
            },
          },
        ],
      };
    },
  },
]);
