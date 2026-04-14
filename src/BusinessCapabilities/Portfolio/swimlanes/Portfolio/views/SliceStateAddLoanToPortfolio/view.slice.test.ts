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
    description: "multiple LoanAddedToPortfolio events overwrite state with latest values",
    given: [
      {
        eventType: "LoanAddedToPortfolio",
        payload: {
          portfolioId: "port-001",
          acquisitionDate: new Date("2025-01-01T11:00:00Z"),
          borrowerName: "Acme Corp",
          creditRating: "BBB",
          interestRate: 0.04,
          loanAmount: 10000000,
          loanId: "test-loanId-001",
          maturityDate: new Date("2030-01-01T11:00:00Z"),
        },
      },
      {
        eventType: "LoanAddedToPortfolio",
        payload: {
          portfolioId: "port-001",
          acquisitionDate: new Date("2025-06-01T11:00:00Z"),
          borrowerName: "Beta Inc",
          creditRating: "A",
          interestRate: 0.035,
          loanAmount: 5000000,
          loanId: "test-loanId-002",
          maturityDate: new Date("2029-01-01T11:00:00Z"),
        },
      },
    ],
    then: {
      portfolioId: "port-001",
      acquisitionDate: new Date("2025-06-01T11:00:00Z"),
      borrowerName: "Beta Inc",
      creditRating: "A",
      interestRate: 0.035,
      loanAmount: 5000000,
      loanId: "test-loanId-002",
      maturityDate: new Date("2029-01-01T11:00:00Z"),
    },
  },
  {
    description: "LoanRejectedFromPortfolio does not change state",
    given: [
      {
        eventType: "LoanRejectedFromPortfolio",
        payload: {},
      },
    ],
    then: defaultState,
  },
]);
