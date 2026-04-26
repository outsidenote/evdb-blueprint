import type { ICommand } from "#abstractions/commands/ICommand.js";

export interface CreateAccount extends ICommand {
  readonly commandType: "CreateAccount";
  readonly currency: string;
  readonly name: string;
  readonly accountId: string;
}
