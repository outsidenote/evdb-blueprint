import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { accountViewSlice } from "../index.js";

describe("Projection: AccountView", () => {
  it("has correct projection name", () => {
    assert.strictEqual(accountViewSlice.projectionName, "AccountView");
  });

  it("AccountCreated handler returns SQL statements", () => {
    const payload = {
      accountId: "test-accountId-001",
      currency: "test-currency",
      name: "test-name",
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "AccountView" };
    const result = accountViewSlice.handlers.AccountCreated!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.ok(result[0].params.length > 0, 'params should not be empty');

    // params: [projectionName, key, accountId, currency, name]
    assert.strictEqual(result[0].params[0], "AccountView", "param 0 should be projectionName");
    assert.strictEqual(result[0].params[1], payload.accountId, "param 1 (key) should be accountId");
    assert.strictEqual(result[0].params[2], payload.accountId, "param 2 should be accountId field");
    assert.strictEqual(result[0].params[3], payload.currency, "param 3 should be currency field");
    assert.strictEqual(result[0].params[4], payload.name, "param 4 should be name field");
  });

});
