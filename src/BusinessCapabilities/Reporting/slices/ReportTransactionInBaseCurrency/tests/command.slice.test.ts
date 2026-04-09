import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { ReportTransactionInBaseCurrency } from "../command.js";
import { handleReportTransactionInBaseCurrency } from "../commandHandler.js";
import { SliceTester, type TestEvent } from "#abstractions/slices/SliceTester.js";
import ReportingStreamFactory from "#BusinessCapabilities/Reporting/swimlanes/Reporting/index.js";
import { enrich } from "#BusinessCapabilities/Reporting/endpoints/ReportTransactionInBaseCurrency/enrichment.js";

describe("ReportTransactionInBaseCurrency Slice - Unit Tests", () => {

  test("automation: payload → enrich → command → event", async () => {
    // What arrives from Kafka
    const payload = {
    account: "1234",
    amount: 21,
    currency: "USD",
    session: "0011",
    };

    // Enrichment step (same as the automation processor does)
    const enriched = await enrich(payload);

    // Build command (same mapping as pg-boss endpoint)
    const command: ReportTransactionInBaseCurrency = {
    commandType: "ReportTransactionInBaseCurrency" as const,
    account: payload.account,
    amount: payload.amount,
    baseCurrencyAmount: enriched.baseCurrencyAmount,
    currency: payload.currency,
    exchangeRate: enriched.exchangeRate,
    reportDate: enriched.reportDate,
    session: payload.session,
    };

    const expectedEvents: TestEvent[] = [
      {
        eventType: "TxnReportedInBaseCurrency",
        payload: {
          amount: command.amount,
          currency: command.currency,
          session: command.session,
          baseCurrencyAmount: command.baseCurrencyAmount,
          exchangeRate: command.exchangeRate,
          account: command.account,
          reportDate: command.reportDate,
        },
      },
    ];

    return SliceTester.testCommandHandler(
      handleReportTransactionInBaseCurrency,
      ReportingStreamFactory,
      [],
      command,
      expectedEvents,
    );
  });

  test("enrichment produces valid enriched fields", async () => {
    const payload = {
    account: "1234",
    amount: 21,
    currency: "USD",
    session: "0011",
    };

    const enriched = await enrich(payload);

    // Input fields passed through
    assert.strictEqual(enriched.account, payload.account);
    assert.strictEqual(enriched.amount, payload.amount);
    assert.strictEqual(enriched.currency, payload.currency);
    assert.strictEqual(enriched.session, payload.session);

    // Enriched fields populated
    assert.strictEqual(typeof enriched.baseCurrencyAmount, "number");
    assert.strictEqual(typeof enriched.exchangeRate, "number");
    assert.ok(enriched.reportDate instanceof Date);
  });

});
