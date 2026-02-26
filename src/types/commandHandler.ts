import type EvDbStream from "@eventualize/core/store/EvDbStream";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";

/**
 * Pure decision function for a command.
 *
 * Receives a typed stream and a command; its only job is to append
 * events to the stream via the stream's typed `appendEvent*` methods.
 * Must NOT fetch, store, or return — all orchestration belongs to the
 * CommandAdapter.
 *
 * @typeParam TStream  — the concrete stream type (carries typed appendEvent methods)
 * @typeParam TCommand — the specific command type
 */
export type CommandHandler<
  TStream extends EvDbStream,
  TCommand,
> = (stream: TStream, command: TCommand) => void;

/**
 * Orchestration function that bridges a caller to a CommandHandler.
 *
 * Accepts a command and returns the resulting event. Internally it:
 *   1. Fetches the stream from the event store
 *   2. Calls the pure CommandHandler
 *   3. Extracts the pending event
 *   4. Stores the stream
 *   5. Returns the event
 *
 * @typeParam TCommand — the specific command type
 * @typeParam TResult  — what the adapter returns (typically EvDbEvent)
 */
export type CommandAdapter<
  TCommand,
  TResult = EvDbEvent,
> = (command: TCommand) => Promise<TResult>;
