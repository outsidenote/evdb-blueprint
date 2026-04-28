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
    description: "multiple LoanAddedToPortfolio events accumulate correctly",
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
    // TODO: adjust 'then' — does state overwrite or accumulate?
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
