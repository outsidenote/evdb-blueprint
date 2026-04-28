import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioLoanDetailsSlice } from "./index.js";

ProjectionSliceTester.run(portfolioLoanDetailsSlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = "portfolio-001";
      const loanId = "loan-001";
      const key = `${portfolioId}:${loanId}`;
      const acquisitionDate = new Date("2024-01-15T00:00:00Z");
      const maturityDate = new Date("2034-01-15T00:00:00Z");
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
              expectedLoss: 5000,
              interestRate: 0.045,
              loanAmount: 500000,
              maturityDate,
              probabilityOfDefault: 0.02,
              riskBand: "Medium",
              expectedPortfolioLoss: 10000,
              riskNarrative: "Moderate risk borrower with stable financials",
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
              acquisitionDate: acquisitionDate.toISOString(),
              borrowerName: "Acme Corp",
              // numeric fields stored as ::numeric, returned as strings by node-postgres
              capitalRequirement: "50000",
              creditRating: "BBB",
              expectedLoss: "5000",
              interestRate: "0.045",
              loanAmount: "500000",
              // maturityDate stored as ::date returns as "YYYY-MM-DD"
              maturityDate: "2034-01-15",
              probabilityOfDefault: "0.02",
              riskBand: "Medium",
              expectedPortfolioLoss: "10000",
              riskNarrative: "Moderate risk borrower with stable financials",
              simulatedDefaultRate: "0.025",
              tailRiskLoss: "75000",
              worstCaseLoss: "100000",
            },
          },
        ],
      };
    },
  },
]);
