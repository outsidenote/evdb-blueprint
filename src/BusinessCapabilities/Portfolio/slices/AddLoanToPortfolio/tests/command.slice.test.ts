import { test, describe } from "node:test";
import type { AddLoanToPortfolio } from "../command.js";
import { handleAddLoanToPortfolio } from "../commandHandler.js";
import { SliceTester, type TestEvent } from "#abstractions/slices/SliceTester.js";
import PortfolioStreamFactory from "#BusinessCapabilities/Portfolio/swimlanes/Portfolio/index.js";

describe("AddLoanToPortfolio Slice - Unit Tests", () => {
  test("main flow", async () => {
    const givenEvents: TestEvent[] = [];
    const command: AddLoanToPortfolio = {
      commandType: "AddLoanToPortfolio",
      portfolioId: "test-portfolioId-001",
      acquisitionDate: new Date("2025-01-01T11:00:00Z"),
      borrowerName: "test-borrowerName",
      creditRating: "test-creditRating",
      interestRate: 0,
      loanAmount: 0,
      loanId: "test-loanId-001",
      maturityDate: new Date("2025-01-01T11:00:00Z"),
    };
    const expectedEvents: TestEvent[] = [
      {
        eventType: "LoanRejectedFromPortfolio",
        payload: {
          portfolioId: "test-portfolioId-001",
          acquisitionDate: new Date("2025-01-01T11:00:00Z"),
          borrowerName: "test-borrowerName",
          creditRating: "test-creditRating",
          interestRate: 0,
          loanAmount: 0,
          loanId: "test-loanId-001",
          maturityDate: new Date("2025-01-01T11:00:00Z"),
          errorMessage: "Amount should be greater than zero",
        },
      },
    ];
    return SliceTester.testCommandHandler(
      handleAddLoanToPortfolio,
      PortfolioStreamFactory,
      givenEvents,
      command,
      expectedEvents,
    );
  });

  test("spec: amountLessThanZero", async () => {
    const givenEvents: TestEvent[] = [];
    const command: AddLoanToPortfolio = {
      commandType: "AddLoanToPortfolio",
      portfolioId: "test-portfolioId-001",
      acquisitionDate: new Date("2025-01-01T11:00:00Z"),
      borrowerName: "test-borrowerName",
      creditRating: "test-creditRating",
      interestRate: 0,
      loanAmount: 0,
      loanId: "test-loanId-001",
      maturityDate: new Date("2025-01-01T11:00:00Z"),
    };
    const expectedEvents: TestEvent[] = [
      {
        eventType: "LoanRejectedFromPortfolio",
        payload: {
          portfolioId: "test-portfolioId-001",
          acquisitionDate: new Date("2025-01-01T11:00:00Z"),
          borrowerName: "test-borrowerName",
          creditRating: "test-creditRating",
          interestRate: 0,
          loanAmount: 0,
          loanId: "test-loanId-001",
          maturityDate: new Date("2025-01-01T11:00:00Z"),
          errorMessage: "Amount should be greater than zero",
        },
      },
    ];
    return SliceTester.testCommandHandler(
      handleAddLoanToPortfolio,
      PortfolioStreamFactory,
      givenEvents,
      command,
      expectedEvents,
    );
  });

  test("spec: portfolioRatingBreached", async () => {
    const givenEvents: TestEvent[] = [
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
    ];
    const command: AddLoanToPortfolio = {
      commandType: "AddLoanToPortfolio",
      portfolioId: "port-001",
      acquisitionDate: new Date("2025-01-01T11:00:00Z"),
      borrowerName: "Risky Corp",
      creditRating: "CCC",
      interestRate: 0,
      loanAmount: 20000000,
      loanId: "test-loanId-001",
      maturityDate: new Date("2025-01-01T11:00:00Z"),
    };
    const expectedEvents: TestEvent[] = [
      {
        eventType: "LoanRejectedFromPortfolio",
        payload: {
          portfolioId: "port-001",
          acquisitionDate: new Date("2025-01-01T11:00:00Z"),
          borrowerName: "Risky Corp",
          creditRating: "CCC",
          interestRate: 0,
          loanAmount: 20000000,
          loanId: "test-loanId-001",
          maturityDate: new Date("2025-01-01T11:00:00Z"),
          errorMessage: "Portfolio rating would be breached by this loan",
        },
      },
    ];
    return SliceTester.testCommandHandler(
      handleAddLoanToPortfolio,
      PortfolioStreamFactory,
      givenEvents,
      command,
      expectedEvents,
    );
  });

  test("spec: portfolioRatingMaintained", async () => {
    const givenEvents: TestEvent[] = [
      {
        eventType: "LoanAddedToPortfolio",
        payload: {
          portfolioId: "port-001",
          acquisitionDate: new Date("2025-01-01T11:00:00Z"),
          borrowerName: "Acme Corp",
          creditRating: "BBB",
          interestRate: 0,
          loanAmount: 10000000,
          loanId: "test-loanId-001",
          maturityDate: new Date("2025-01-01T11:00:00Z"),
        },
      },
    ];
    const command: AddLoanToPortfolio = {
      commandType: "AddLoanToPortfolio",
      portfolioId: "port-001",
      acquisitionDate: new Date("2025-01-01T11:00:00Z"),
      borrowerName: "test-borrowerName",
      creditRating: "BBB",
      interestRate: 0,
      loanAmount: 5000000,
      loanId: "test-loanId-001",
      maturityDate: new Date("2025-01-01T11:00:00Z"),
    };
    const expectedEvents: TestEvent[] = [
      {
        eventType: "LoanAddedToPortfolio",
        payload: {
          portfolioId: "port-001",
          acquisitionDate: new Date("2025-01-01T11:00:00Z"),
          borrowerName: "test-borrowerName",
          creditRating: "BBB",
          interestRate: 0,
          loanAmount: 5000000,
          loanId: "test-loanId-001",
          maturityDate: new Date("2025-01-01T11:00:00Z"),
        },
      },
    ];
    return SliceTester.testCommandHandler(
      handleAddLoanToPortfolio,
      PortfolioStreamFactory,
      givenEvents,
      command,
      expectedEvents,
    );
  });

});
