import type { CommandHandler } from "#abstractions/commands/commandHandler.js";
import type { CreateAccount } from "./command.js";
import type { AccountStreamType } from "#BusinessCapabilities/Account/swimlanes/Account/index.js";

/**
 * Pure command handler for the CreateAccount command.
 * ONLY appends events — no I/O, no fetching, no returning values.
 */
export const handleCreateAccount: CommandHandler<
  AccountStreamType,
  CreateAccount
> = (stream, command) => {
  stream.appendEventAccountcreated({
    currency: command.currency,
    name: command.name,
    accountId: command.accountId,
  });
};
