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
  });

});
