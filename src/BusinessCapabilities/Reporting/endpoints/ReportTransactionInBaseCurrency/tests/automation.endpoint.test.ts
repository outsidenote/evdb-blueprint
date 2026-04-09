import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { endpointIdentity } from "../pg-boss/index.js";

describe("ReportTransactionInBaseCurrency Automation Endpoint", () => {
  it("has correct endpoint identity", () => {
    assert.strictEqual(endpointIdentity.source, "message");
    assert.strictEqual(endpointIdentity.messageType, "FundsWithdrawn");
    assert.strictEqual(endpointIdentity.handlerName, "ReportTransactionInBaseCurrency");
    assert.strictEqual(endpointIdentity.queueName, "message.FundsWithdrawn.ReportTransactionInBaseCurrency");
  });
});
