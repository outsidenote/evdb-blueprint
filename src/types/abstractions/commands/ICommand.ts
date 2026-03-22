/**
 * Base interface for all commands.
 *
 * Commands are plain data objects (POCOs) that carry the intent of a user action.
 * They are discriminated by the `commandType` literal, which allows command handlers
 * to be statically typed without class inheritance.
 */
export interface ICommand {
  readonly commandType: string;
}
