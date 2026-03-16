import { test, describe } from "node:test";
import * as assert from "node:assert";
import { extractOutboxId, parsePayload } from "../kafkaConsumerUtils.js";

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

  test("fallback 2: derives id from JSON message key when value has no outboxId", () => {
    const id = extractOutboxId({
      key: buf(JSON.stringify({ payload: "stream-abc" })),
      value: buf(JSON.stringify({ account: "x" })),
    });
    assert.match(id, /^stream-abc-\d+$/);
  });

  test("fallback 2: derives id from raw string key", () => {
    const id = extractOutboxId({
      key: buf("raw-key"),
      value: null,
    });
    assert.match(id, /^raw-key-\d+$/);
  });

  test("last resort: returns unknown-<timestamp> when everything is null", () => {
    const id = extractOutboxId({ key: null, value: null });
    assert.match(id, /^unknown-\d+$/);
  });
});

// ── parsePayload ───────────────────────────────────────────────────────────

describe("parsePayload", () => {
  test("returns empty object when value is null", () => {
    assert.deepStrictEqual(parsePayload({ value: null }), {});
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

  test("returns { raw } when value is not valid JSON", () => {
    const result = parsePayload({ value: buf("not-json") });
    assert.deepStrictEqual(result, { raw: "not-json" });
  });
});
