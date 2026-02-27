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
 * Result returned by a CommandAdapter after orchestration.
 *
 * Contains the stream ID and all events emitted by the handler.
 * If no events were emitted (idempotent/no-op), events is empty
 * and the stream was NOT stored.
 */
export interface CommandHandlerOrchestratorResult {
  readonly streamId: string;
  readonly events: readonly EvDbEvent[];
}

/**
 * Orchestration function that bridges a caller to a CommandHandler.
 *
 * Accepts a command and returns the result. Internally it:
 *   1. Fetches the stream from the event store
 *   2. Calls the pure CommandHandler
 *   3. Collects pending events
 *   4. If events emitted → stores the stream
 *   5. Returns { streamId, events }
 *
 * @typeParam TCommand — the specific command type
 */
export type CommandHandlerOrchestrator<TCommand> =
  (command: TCommand) => Promise<CommandHandlerOrchestratorResult>;
