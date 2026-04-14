import { ViewSliceTester, type ViewConfig } from "#abstractions/slices/ViewSliceTester.js";
import { handlers } from "./handlers.js";
import { type SliceStateAddLoanToPortfolioViewState, viewName, defaultState } from "./state.js";

const sliceStateAddLoanToPortfolioView: ViewConfig<SliceStateAddLoanToPortfolioViewState> = {
  name: viewName,
  defaultState,
  handlers,
};

ViewSliceTester.run(sliceStateAddLoanToPortfolioView, [
  {
    description: "LoanAddedToPortfolio updates state correctly",
    given: [
      {
        eventType: "LoanAddedToPortfolio",
        payload: {
          portfolioId: "port-001",
          acquisitionDate: new Date("2025-01-01T11:00:00Z"),
          borrowerName: "test-borrowerName",
          creditRating: "test-creditRating",
          interestRate: 0,
          loanAmount: 0,
          loanId: "test-loanId-001",
          maturityDate: new Date("2025-01-01T11:00:00Z"),
        },
      },
    ],
    then: {
      portfolioId: "port-001",
      acquisitionDate: new Date("2025-01-01T11:00:00Z"),
      borrowerName: "test-borrowerName",
      creditRating: "test-creditRating",
      interestRate: 0,
      loanAmount: 0,
      loanId: "test-loanId-001",
      maturityDate: new Date("2025-01-01T11:00:00Z"),
    },
  },
  {
    description: "second LoanAddedToPortfolio overwrites state from first",
    given: [
      {
        eventType: "LoanAddedToPortfolio",
        payload: {
          portfolioId: "port-001",
          acquisitionDate: new Date("2025-01-01T11:00:00Z"),
          borrowerName: "First Corp",
          creditRating: "AAA",
          interestRate: 4,
          loanAmount: 10000000,
          loanId: "loan-001",
          maturityDate: new Date("2030-01-01T00:00:00Z"),
        },
      },
      {
        eventType: "LoanAddedToPortfolio",
        payload: {
          portfolioId: "port-002",
          acquisitionDate: new Date("2025-06-01T00:00:00Z"),
          borrowerName: "Second Corp",
          creditRating: "BBB",
          interestRate: 7,
          loanAmount: 20000000,
          loanId: "loan-002",
          maturityDate: new Date("2035-01-01T00:00:00Z"),
        },
      },
    ],
    then: {
      portfolioId: "port-002",
      acquisitionDate: new Date("2025-06-01T00:00:00Z"),
      borrowerName: "Second Corp",
      creditRating: "BBB",
      interestRate: 7,
      loanAmount: 20000000,
      loanId: "loan-002",
      maturityDate: new Date("2035-01-01T00:00:00Z"),
    },
  },
  {
    description: "LoanRejectedFromPortfolio does not change state",
    given: [
      {
        eventType: "LoanRejectedFromPortfolio",
        payload: {
          portfolioId: "port-001",
          acquisitionDate: new Date("2025-01-01T11:00:00Z"),
          borrowerName: "Risky Corp",
          creditRating: "CCC",
          interestRate: 12,
          loanAmount: 20000000,
          loanId: "loan-001",
          maturityDate: new Date("2030-01-01T00:00:00Z"),
          errorMessage: "Portfolio credit rating limit breached",
        },
      },
    ],
    then: defaultState,
  },
]);
