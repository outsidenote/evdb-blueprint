import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../enrichment.js";

describe("ExchangerateCalculator Enrichment", () => {
  it("skips API call when currency is EUR and returns rate=1", async () => {
    const input = {
      account: "1234",
      amount: 50,
      currency: "EUR",
      session: "0011",
    };

    const result = await enrich(input);

    assert.strictEqual(result.account, input.account);
    assert.strictEqual(result.amount, input.amount);
    assert.strictEqual(result.currency, input.currency);
    assert.strictEqual(result.session, input.session);
    assert.strictEqual(result.exchangeRate, 1);
    assert.strictEqual(result.baseCurrencyAmount, 50);
    assert.ok(result.reportDate instanceof Date);
  });

  it("fetches exchange rate and computes baseCurrencyAmount rounded to 2dp", async () => {
    const mockFetch = mock.fn(async () => ({
      json: async () => ({ base: "USD", date: "2026-04-02", rates: { EUR: 0.92 } }),
    }));
    // @ts-ignore
    globalThis.fetch = mockFetch;

    const input = {
      account: "1234",
      amount: 21,
      currency: "USD",
      session: "0011",
    };

    const result = await enrich(input);

    assert.strictEqual(result.exchangeRate, 0.92);
    assert.strictEqual(result.baseCurrencyAmount, 19.32); // 21 * 0.92 = 19.32
    assert.ok(result.reportDate instanceof Date);
    assert.strictEqual(mockFetch.mock.calls.length, 1);
    assert.ok((mockFetch.mock.calls[0].arguments[0] as string).includes("from=USD&to=EUR"));

    mock.restoreAll();
  });
});
