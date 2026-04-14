import { randomUUID } from "node:crypto";
import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioSummarySlice } from "../index.js";

ProjectionSliceTester.run(portfolioSummarySlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = randomUUID();
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            averageProbabilityOfDefault: 5,
            averageRating: "A",
            averageRiskWeight: "10",
            riskBand: "A",
            totalCapitalRequirement: "1000",
            totalExpectedLoss: 12,
            totalExposure: "10000",
            totalLoans: 2,
            worstRating: "CC",
          } },
        ],
        then: [{ key: portfolioId, expectedState: {
          portfolioId,
          averageProbabilityOfDefault: 5.0,
          averageRating: "A",
          averageRiskWeight: 10.0,
          riskBand: "A",
          totalCapitalRequirement: 1000.0,
          totalExpectedLoss: 12.0,
          totalExposure: 10000.0,
          totalLoans: 2,
          worstRating: "CC",
        } }],
      };
    },
  },
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      const portfolioId = randomUUID();
      return {
        given: [
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            averageProbabilityOfDefault: 5,
            averageRating: "A",
            averageRiskWeight: "10",
            riskBand: "A",
            totalCapitalRequirement: "1000",
            totalExpectedLoss: 12,
            totalExposure: "10000",
            totalLoans: 2,
            worstRating: "CC",
          } },
          { messageType: "LoanRiskAssessed", payload: {
            portfolioId,
            averageProbabilityOfDefault: 10,
            averageRating: "A",
            averageRiskWeight: 20,
            riskBand: "A",
            totalCapitalRequirement: 2000,
            totalExpectedLoss: 24,
            totalExposure: 20000,
            totalLoans: 4,
            worstRating: "CC",
          } },
        ],
        // Spec: Aggregates per portfolio. Each LoanRiskAssessed increments totalLoans by 1, adds loanAmount to totalExposure, adds capit...
        then: [{ key: portfolioId, expectedState: {
          portfolioId,
          averageProbabilityOfDefault: 0, // TODO: expected accumulated value after 2 events
          averageRating: "", // TODO: expected derived value after 2 events
          averageRiskWeight: 0, // TODO: expected accumulated value after 2 events
          riskBand: "", // TODO: expected derived value after 2 events
          totalCapitalRequirement: 0, // TODO: expected accumulated value after 2 events
          totalExpectedLoss: 0, // TODO: expected accumulated value after 2 events
          totalExposure: 0, // TODO: expected accumulated value after 2 events
          totalLoans: 0, // TODO: expected accumulated value after 2 events
          worstRating: "", // TODO: expected derived value after 2 events
        } }],
      };
    },
  },
]);
