import { ProjectionSliceTester } from "#abstractions/slices/ProjectionSliceTester.js";
import { portfolioExposureSlice } from "./index.js";

ProjectionSliceTester.run(portfolioExposureSlice, [
  {
    description: "LoanRiskAssessed: first event creates initial state",
    run: () => {
      const portfolioId = "PORT-01";
      const creditRating = "AAA";
      const loanAmount = 1000000;
      const probabilityOfDefault = 0.03;
      const key = `${portfolioId}:${creditRating}`;
      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              creditRating,
              loanAmount,
              probabilityOfDefault,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId,
              creditRating,
              // avgPD = probabilityOfDefault (first event: no prior state)
              avgPD: 0.03,
              // exposure = loanAmount (first event)
              exposure: 1000000,
              // loanCount = 1 (first event)
              loanCount: 1,
            },
          },
        ],
      };
    },
  },
  {
    description: "two LoanRiskAssessed events: fields accumulate correctly",
    run: () => {
      const portfolioId = "PORT-01";
      const creditRating = "AAA";
      const key = `${portfolioId}:${creditRating}`;

      // Event 1
      const loanAmount1 = 1000000;
      const probabilityOfDefault1 = 0.02;

      // Event 2
      const loanAmount2 = 500000;
      const probabilityOfDefault2 = 0.08;

      // Accumulated state after 2 events:
      // exposure = 1000000 + 500000 = 1500000
      // loanCount = 1 + 1 = 2
      // avgPD = (prev_avgPD * prev_exposure + probabilityOfDefault2 * loanAmount2) / (prev_exposure + loanAmount2)
      //       = (0.02 * 1000000 + 0.08 * 500000) / (1000000 + 500000)
      //       = (20000 + 40000) / 1500000
      //       = 60000 / 1500000
      //       = 0.04

      return {
        given: [
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              creditRating,
              loanAmount: loanAmount1,
              probabilityOfDefault: probabilityOfDefault1,
            },
          },
          {
            messageType: "LoanRiskAssessed",
            payload: {
              portfolioId,
              creditRating,
              loanAmount: loanAmount2,
              probabilityOfDefault: probabilityOfDefault2,
            },
          },
        ],
        then: [
          {
            key,
            expectedState: {
              portfolioId,
              creditRating,
              // avgPD = (0.02 * 1000000 + 0.08 * 500000) / (1000000 + 500000) = 0.04
              avgPD: 0.04,
              // exposure = 1000000 + 500000 = 1500000
              exposure: 1500000,
              // loanCount = 2
              loanCount: 2,
            },
          },
        ],
      };
    },
  },
]);
