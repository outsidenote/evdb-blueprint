import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioLoanDetailsSlice } from "./index.js";

ProjectionSliceTester.run(portfolioLoanDetailsSlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = "portfolio-001";
      const loanId = "loan-001";
      // Key matches how the projection handler builds it: portfolioId:loanId
      const key = `${portfolioId}:${loanId}`;
      const acquisitionDate = new Date("2024-06-15T00:00:00.000Z");
      const maturityDate = new Date("2034-06-15T00:00:00.000Z");
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            loanId,
            acquisitionDate,
            borrowerName: "Acme Corp",
            capitalRequirement: 80000,
            creditRating: "BBB",
            expectedLoss: 5000,
            interestRate: 0.045,
            loanAmount: 1000000,
            maturityDate,
            probabilityOfDefault: 0.02,
            riskBand: "MEDIUM",
            expectedPortfolioLoss: 50000,
            riskNarrative: "Moderate risk; stable industry sector",
            simulatedDefaultRate: 0.018,
            tailRiskLoss: 150000,
            worstCaseLoss: 300000,
          } },
        ],
        then: [{ key, expectedState: {
          // All fields overwrite on each event — no accumulation
          portfolioId,
          loanId,
          // Dates stored as ISO strings in jsonb
          acquisitionDate: "2024-06-15T00:00:00.000Z",
          borrowerName: "Acme Corp",
          capitalRequirement: 80000,
          creditRating: "BBB",
          expectedLoss: 5000,
          interestRate: 0.045,
          loanAmount: 1000000,
          // Dates stored as ISO strings in jsonb
          maturityDate: "2034-06-15T00:00:00.000Z",
          probabilityOfDefault: 0.02,
          riskBand: "MEDIUM",
          expectedPortfolioLoss: 50000,
          riskNarrative: "Moderate risk; stable industry sector",
          simulatedDefaultRate: 0.018,
          tailRiskLoss: 150000,
          worstCaseLoss: 300000,
        } }],
      };
    },
  },
]);
