import { test, describe } from "node:test";
import type { CreateAccount } from "../command.js";
import { handleCreateAccount } from "../commandHandler.js";
import { SliceTester, type TestEvent } from "#abstractions/slices/SliceTester.js";
import AccountStreamFactory from "#BusinessCapabilities/Account/swimlanes/Account/index.js";

describe("CreateAccount Slice - Unit Tests", () => {
  test("main flow", async () => {
    const givenEvents: TestEvent[] = [];
    const command: CreateAccount = {
      commandType: "CreateAccount",
      currency: "test-currency",
      name: "test-name",
      accountId: "test-accountId-001",
    };
    const expectedEvents: TestEvent[] = [
    ];
    return SliceTester.testCommandHandler(
      handleCreateAccount,
      AccountStreamFactory,
      givenEvents,
      command,
      expectedEvents,
    );
  });

});
