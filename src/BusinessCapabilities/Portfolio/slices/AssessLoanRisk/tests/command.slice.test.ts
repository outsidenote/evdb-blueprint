import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { AssessLoanRisk } from "../command.js";
import { handleAssessLoanRisk } from "../commandHandler.js";
import { SliceTester, type TestEvent } from "#abstractions/slices/SliceTester.js";
import PortfolioStreamFactory from "#BusinessCapabilities/Portfolio/swimlanes/Portfolio/index.js";
import { enrich } from "#BusinessCapabilities/Portfolio/endpoints/AssessLoanRisk/enrichment.js";

describe("AssessLoanRisk Slice - Unit Tests", () => {

  test("automation: payload → enrich → command → event", async () => {
    // What arrives from Kafka
    const payload = {
    portfolioId: "test-portfolioId-001",
    borrowerName: "test-borrowerName",
    creditRating: "test-creditRating",
    interestRate: 0,
    loanAmount: 0,
    loanId: "test-loanId-001",
    maturityDate: new Date("2025-01-01T11:00:00Z"),
    };

    // Enrichment step (same as the automation processor does)
    const enriched = await enrich(payload);

    // Build command (same mapping as pg-boss endpoint)
    const command: AssessLoanRisk = {
    commandType: "AssessLoanRisk" as const,
    portfolioId: payload.portfolioId,
    acquisitionDate: enriched.acquisitionDate,
    borrowerName: payload.borrowerName,
    creditRating: payload.creditRating,
    expectedLoss: enriched.expectedLoss,
    interestRate: payload.interestRate,
    loanAmount: payload.loanAmount,
    loanId: payload.loanId,
    maturityDate: payload.maturityDate,
    probabilityOfDefault: enriched.probabilityOfDefault,
    capitalRequirement: enriched.capitalRequirement,
    riskBand: enriched.riskBand,
    expectedPortfolioLoss: enriched.expectedPortfolioLoss,
    riskNarrative: enriched.riskNarrative,
    simulatedDefaultRate: enriched.simulatedDefaultRate,
    tailRiskLoss: enriched.tailRiskLoss,
    worstCaseLoss: enriched.worstCaseLoss,
    };

    const expectedEvents: TestEvent[] = [
      {
        eventType: "LoanRiskAssessed",
        payload: {
          acquisitionDate: command.acquisitionDate,
          borrowerName: command.borrowerName,
          capitalRequirement: command.capitalRequirement,
          creditRating: command.creditRating,
          expectedLoss: command.expectedLoss,
          expectedPortfolioLoss: command.expectedPortfolioLoss,
          interestRate: command.interestRate,
          loanAmount: command.loanAmount,
          loanId: command.loanId,
          maturityDate: command.maturityDate,
          portfolioId: command.portfolioId,
          probabilityOfDefault: command.probabilityOfDefault,
          riskBand: command.riskBand,
          riskNarrative: command.riskNarrative,
          simulatedDefaultRate: command.simulatedDefaultRate,
          tailRiskLoss: command.tailRiskLoss,
          worstCaseLoss: command.worstCaseLoss,
        },
      },
    ];

    return SliceTester.testCommandHandler(
      handleAssessLoanRisk,
      PortfolioStreamFactory,
      [],
      command,
      expectedEvents,
    );
  });

  test("enrichment produces valid enriched fields", async () => {
    const payload = {
    portfolioId: "test-portfolioId-001",
    borrowerName: "test-borrowerName",
    creditRating: "test-creditRating",
    interestRate: 0,
    loanAmount: 0,
    loanId: "test-loanId-001",
    maturityDate: new Date("2025-01-01T11:00:00Z"),
    };

    const enriched = await enrich(payload);

    // Input fields passed through
    assert.strictEqual(enriched.portfolioId, payload.portfolioId);
    assert.strictEqual(enriched.borrowerName, payload.borrowerName);
    assert.strictEqual(enriched.creditRating, payload.creditRating);
    assert.strictEqual(enriched.interestRate, payload.interestRate);
    assert.strictEqual(enriched.loanAmount, payload.loanAmount);
    assert.strictEqual(enriched.loanId, payload.loanId);
    assert.strictEqual(enriched.maturityDate, payload.maturityDate);

    // Enriched fields populated
    assert.ok(enriched.acquisitionDate instanceof Date);
    assert.strictEqual(typeof enriched.capitalRequirement, "number");
    assert.strictEqual(typeof enriched.expectedLoss, "number");
    assert.strictEqual(typeof enriched.probabilityOfDefault, "number");
    assert.strictEqual(typeof enriched.riskBand, "string");
    assert.strictEqual(typeof enriched.simulatedDefaultRate, "number");
    assert.strictEqual(typeof enriched.expectedPortfolioLoss, "number");
    assert.strictEqual(typeof enriched.worstCaseLoss, "number");
    assert.strictEqual(typeof enriched.tailRiskLoss, "number");
    assert.strictEqual(typeof enriched.riskNarrative, "string");
  });

});
