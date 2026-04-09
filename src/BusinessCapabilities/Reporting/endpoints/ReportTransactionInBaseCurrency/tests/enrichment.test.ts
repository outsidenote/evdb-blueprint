import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("ReportTransactionInBaseCurrency Enrichment", () => {
  it("enriches input with computed fields", async () => {
    const input = {
    account: "1234",
    amount: 21,
    currency: "USD",
    session: "0011",
    };

    const result = await enrich(input);

    // Verify input fields are passed through
    assert.strictEqual(result.account, input.account);
    assert.strictEqual(result.amount, input.amount);
    assert.strictEqual(result.currency, input.currency);
    assert.strictEqual(result.session, input.session);

    // Verify enriched fields are populated
    assert.strictEqual(typeof result.baseCurrencyAmount, "number");
    assert.strictEqual(typeof result.exchangeRate, "number");
    assert.ok(result.reportDate instanceof Date);
  });
});
