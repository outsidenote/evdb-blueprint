import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { endpointIdentity } from "../pg-boss/index.js";

describe("AssessLoanRisk Automation Endpoint", () => {
  it("has correct endpoint identity", () => {
    assert.strictEqual(endpointIdentity.source, "event");
    assert.strictEqual(endpointIdentity.messageType, "LoansPendingRiskAssess");
    assert.strictEqual(endpointIdentity.handlerName, "AssessLoanRisk");
    assert.strictEqual(endpointIdentity.queueName, "event.LoansPendingRiskAssess.AssessLoanRisk");
  });
});
