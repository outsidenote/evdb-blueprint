import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { accountViewSlice } from "../index.js";

describe("Projection: AccountView", () => {
  it("has correct projection name", () => {
    assert.strictEqual(accountViewSlice.projectionName, "AccountView");
  });

  it("Accountcreated handler returns SQL statements", () => {
    const payload = {
      accountId: "test-accountId-001",
      currency: "test-currency",
      name: "test-name",
    };
    const meta = { outboxId: "test-id", storedAt: new Date(), projectionName: "AccountView" };
    const result = accountViewSlice.handlers.Accountcreated!(payload, meta)!;

    assert.ok(result.length > 0, 'should have at least one SQL statement');
    assert.ok(result[0].sql.length > 0, 'SQL should not be empty');
    assert.ok(result[0].params.length > 0, 'params should not be empty');

    // Verify SQL params contain correct field values
    const params = result[0].params;
    assert.strictEqual(params[0], "AccountView", 'params[0] should be the projection name');
    assert.strictEqual(params[1], "test-accountId-001", 'params[1] should be the accountId key');
    assert.strictEqual(params[2], "test-accountId-001", 'params[2] should be accountId');
    assert.strictEqual(params[3], "test-currency", 'params[3] should be currency');
    assert.strictEqual(params[4], "test-name", 'params[4] should be name');
  });

});
