import { test, describe } from "node:test";
import * as assert from "node:assert";
import { extractOutboxId, parsePayload } from "./kafkaConsumerUtils.js";

// ── helpers ────────────────────────────────────────────────────────────────

function buf(s: string): Buffer {
  return Buffer.from(s);
}

// ── extractOutboxId ────────────────────────────────────────────────────────

describe("extractOutboxId", () => {
  test("primary: reads 'id' header as Buffer", () => {
    const id = extractOutboxId({
      key: null,
      value: null,
      headers: { id: buf("abc-123") },
    });
    assert.strictEqual(id, "abc-123");
  });

  test("primary: reads 'id' header as string", () => {
    const id = extractOutboxId({
      key: null,
      value: null,
      headers: { id: "abc-456" },
    });
    assert.strictEqual(id, "abc-456");
  });

  test("fallback 1: reads outboxId from plain JSON value", () => {
    const id = extractOutboxId({
      key: null,
      value: buf(JSON.stringify({ outboxId: "plain-id" })),
    });
    assert.strictEqual(id, "plain-id");
  });

  test("fallback 1: reads outboxId from Debezium envelope (payload object)", () => {
    const id = extractOutboxId({
      key: null,
      value: buf(JSON.stringify({ schema: {}, payload: { outboxId: "envelope-id" } })),
    });
    assert.strictEqual(id, "envelope-id");
  });

  test("throws when header and outboxId are both missing", () => {
    assert.throws(
      () => extractOutboxId({ key: null, value: null }),
      /Cannot extract outboxId/,
    );
  });
});

// ── parsePayload ───────────────────────────────────────────────────────────

describe("parsePayload", () => {
  test("throws when value is null", () => {
    assert.throws(
      () => parsePayload({ value: null }),
      /message value is null/,
    );
  });

  test("parses plain JSON object", () => {
    const result = parsePayload({
      value: buf(JSON.stringify({ account: "acc-1", amount: 100 })),
    });
    assert.deepStrictEqual(result, { account: "acc-1", amount: 100 });
  });

  test("unwraps Debezium envelope: payload is an object", () => {
    const inner = { account: "acc-2", currency: "USD" };
    const result = parsePayload({
      value: buf(JSON.stringify({ schema: {}, payload: inner })),
    });
    assert.deepStrictEqual(result, inner);
  });

  test("unwraps Debezium envelope: payload is a JSON string (double-encoded)", () => {
    const inner = { account: "acc-3", amount: 200 };
    const result = parsePayload({
      value: buf(JSON.stringify({ schema: {}, payload: JSON.stringify(inner) })),
    });
    assert.deepStrictEqual(result, inner);
  });

  test("throws when value is not valid JSON", () => {
    assert.throws(
      () => parsePayload({ value: buf("not-json") }),
      /payload parse failed/,
    );
  });
});
