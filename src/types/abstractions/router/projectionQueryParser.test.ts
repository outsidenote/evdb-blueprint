import { test, describe } from "node:test";
import * as assert from "node:assert";
import {
  parseProjectionQuery,
  nextAfterKey,
  QueryValidationError,
} from "./projectionQueryParser.js";

const P = "TestProjection";

function parse(params: Record<string, unknown>) {
  return parseProjectionQuery(P, params);
}

function assertThrows(params: Record<string, unknown>, expectedMessage: string | RegExp) {
  assert.throws(
    () => parse(params),
    (err: unknown) => {
      assert.ok(err instanceof QueryValidationError, `Expected QueryValidationError, got ${err}`);
      if (typeof expectedMessage === "string") {
        assert.ok(err.message.includes(expectedMessage), `"${err.message}" does not include "${expectedMessage}"`);
      } else {
        assert.match(err.message, expectedMessage);
      }
      return true;
    },
  );
}


describe("parseProjectionQuery: mode detection", () => {
  test("parses byKey", () => {
    const q = parse({ key: "acct-1" });
    assert.deepStrictEqual(q, { mode: "byKey", projectionName: P, key: "acct-1" });
  });

  test("parses byKeys", () => {
    const q = parse({ keys: "a,b,c" });
    assert.deepStrictEqual(q, { mode: "byKeys", projectionName: P, keys: ["a", "b", "c"] });
  });

  test("parses betweenKeys", () => {
    const q = parse({ from: "a", to: "z" });
    assert.strictEqual(q.mode, "betweenKeys");
    if (q.mode === "betweenKeys") {
      assert.strictEqual(q.from, "a");
      assert.strictEqual(q.to, "z");
      assert.strictEqual(q.limit, 100);
      assert.strictEqual(q.afterKey, undefined);
    }
  });

  test("no mode params → error", () => {
    assertThrows({}, "Provide one of");
  });
});


describe("parseProjectionQuery: mutual exclusivity", () => {
  test("key + keys → error", () => {
    assertThrows({ key: "a", keys: "b,c" }, "mutually exclusive");
  });

  test("key + from + to → error", () => {
    assertThrows({ key: "a", from: "x", to: "z" }, "mutually exclusive");
  });

  test("keys + from + to → error", () => {
    assertThrows({ keys: "a,b", from: "x", to: "z" }, "mutually exclusive");
  });

  test("from without to → error", () => {
    assertThrows({ from: "a" }, "'from' requires 'to'");
  });

  test("to without from → error", () => {
    assertThrows({ to: "z" }, "'to' requires 'from'");
  });
});


describe("parseProjectionQuery: validation", () => {
  test("empty key → error", () => {
    assertThrows({ key: "" }, "'key' must be a non-empty string");
  });

  test("whitespace-only key → error", () => {
    assertThrows({ key: "   " }, "'key' must be a non-empty string");
  });

  test("empty keys string → error", () => {
    assertThrows({ keys: "" }, "'keys' must be a non-empty string");
  });

  test("keys with only commas → error", () => {
    assertThrows({ keys: ",,," }, "at least one non-empty key");
  });

  test("empty from → error", () => {
    assertThrows({ from: "", to: "z" }, "'from' must be a non-empty string");
  });

  test("empty to → error", () => {
    assertThrows({ from: "a", to: "" }, "'to' must be a non-empty string");
  });

  test("empty afterKey → error", () => {
    assertThrows({ from: "a", to: "z", afterKey: "" }, "'afterKey' must be a non-empty string when provided");
  });

  test("empty projectionName → error", () => {
    assert.throws(
      () => parseProjectionQuery("", { key: "a" }),
      (err: unknown) => err instanceof QueryValidationError && err.message.includes("projectionName"),
    );
  });
});


describe("parseProjectionQuery: unknown and repeated params", () => {
  test("unknown param → error", () => {
    assertThrows({ key: "a", foo: "bar" }, "Unknown query parameter: 'foo'");
  });

  test("array-valued param → error", () => {
    assertThrows({ key: ["a", "b"] }, "must not be repeated");
  });
});

// ── Pagination params on non-paginated modes ────────────────────────────────

describe("parseProjectionQuery: pagination rejection", () => {
  test("afterKey on byKey → error", () => {
    assertThrows({ key: "a", afterKey: "x" }, "'afterKey' is not supported");
  });

  test("limit on byKey → error", () => {
    assertThrows({ key: "a", limit: "10" }, "'limit' is not supported");
  });

  test("afterKey on byKeys → error", () => {
    assertThrows({ keys: "a,b", afterKey: "x" }, "'afterKey' is not supported");
  });

  test("limit on byKeys → error", () => {
    assertThrows({ keys: "a,b", limit: "10" }, "'limit' is not supported");
  });
});

// ── Limit parsing ───────────────────────────────────────────────────────────

describe("parseProjectionQuery: limit", () => {
  test("valid limit on betweenKeys", () => {
    const q = parse({ from: "a", to: "z", limit: "50" });
    assert.strictEqual(q.mode, "betweenKeys");
    if (q.mode === "betweenKeys") assert.strictEqual(q.limit, 50);
  });

  test("limit = 0 → error", () => {
    assertThrows({ from: "a", to: "z", limit: "0" }, "positive integer");
  });

  test("negative limit → error", () => {
    assertThrows({ from: "a", to: "z", limit: "-5" }, "positive integer");
  });

  test("non-numeric limit → error", () => {
    assertThrows({ from: "a", to: "z", limit: "abc" }, "positive integer");
  });

  test("limit exceeds MAX_LIMIT → error", () => {
    assertThrows({ from: "a", to: "z", limit: "9999" }, "must not exceed");
  });

  test("default limit when omitted", () => {
    const q = parse({ from: "a", to: "z" });
    if (q.mode === "betweenKeys") assert.strictEqual(q.limit, 100);
  });
});

// ── afterKey parsing ────────────────────────────────────────────────────────

describe("parseProjectionQuery: afterKey", () => {
  test("betweenKeys with afterKey", () => {
    const q = parse({ from: "a", to: "z", afterKey: "m" });
    if (q.mode === "betweenKeys") assert.strictEqual(q.afterKey, "m");
  });
});

// ── keys trimming ───────────────────────────────────────────────────────────

describe("parseProjectionQuery: keys trimming", () => {
  test("trims whitespace from keys", () => {
    const q = parse({ keys: " a , b , c " });
    if (q.mode === "byKeys") {
      assert.deepStrictEqual(q.keys, ["a", "b", "c"]);
    }
  });

  test("filters empty segments", () => {
    const q = parse({ keys: "a,,b," });
    if (q.mode === "byKeys") {
      assert.deepStrictEqual(q.keys, ["a", "b"]);
    }
  });
});

// ── nextAfterKey helper ─────────────────────────────────────────────────────

describe("nextAfterKey", () => {
  test("returns last item key", () => {
    assert.strictEqual(nextAfterKey([{ key: "a" }, { key: "b" }, { key: "c" }]), "c");
  });

  test("returns undefined for empty array", () => {
    assert.strictEqual(nextAfterKey([]), undefined);
  });
});
