import type EvDbStream from "@eventualize/core/store/EvDbStream";
import type { CommandHandler, CommandAdapter, CommandAdapterResult } from "./commandHandler.js";

/**
 * Minimal interface for the event store dependency.
 * Accepts only what the adapter needs — no coupling to the full EvDbEventStore.
 */
export interface EventStorePort {
  getStream(streamType: string, streamId: string): Promise<EvDbStream>;
}

/**
 * Creates a CommandAdapter that orchestrates:
 *   fetch stream → decide → collect events → store (if any) → return result.
 *
 * If the handler emits no events (idempotent / no-op), the stream is NOT stored
 * and an empty events array is returned.
 *
 * @typeParam TStream  — concrete typed stream (e.g. WithdrawalApprovalStreamType)
 * @typeParam TCommand — command type (e.g. ApproveWithdrawal)
 *
 * @param eventStore  — the event store (injected, not imported)
 * @param streamType  — stream type string registered in the event store
 * @param getStreamId — derives the stream ID from the command
 * @param handler     — pure decision function
 */
export function createCommandAdapter<
  TStream extends EvDbStream,
  TCommand,
>(
  eventStore: EventStorePort,
  streamType: string,
  getStreamId: (command: TCommand) => string,
  handler: CommandHandler<TStream, TCommand>,
): CommandAdapter<TCommand> {
  return async (command: TCommand): Promise<CommandAdapterResult> => {
    const streamId = getStreamId(command);
    const stream = await eventStore.getStream(
      streamType,
      streamId,
    ) as TStream;

    handler(stream, command);

    const events = stream.getEvents();

    if (events.length === 0) {
      return { streamId, events: [] };
    }

    await stream.store();
    return { streamId, events };
  };
}
