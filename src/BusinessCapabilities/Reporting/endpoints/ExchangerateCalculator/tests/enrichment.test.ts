import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("ExchangerateCalculator Enrichment", () => {
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

  it("skips API call when currency is EUR", async () => {
    const input = {
      account: "5678",
      amount: 50,
      currency: "EUR",
      session: "0022",
    };

    const result = await enrich(input);

    assert.strictEqual(result.exchangeRate, 1);
    assert.strictEqual(result.baseCurrencyAmount, 50);
    assert.ok(result.reportDate instanceof Date);
  });
});
