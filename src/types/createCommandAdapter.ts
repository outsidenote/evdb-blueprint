import type EvDbStream from "@eventualize/core/store/EvDbStream";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type { CommandHandler, CommandAdapter } from "./commandHandler.js";

/**
 * Minimal interface for the event store dependency.
 * Accepts only what the adapter needs — no coupling to the full EvDbEventStore.
 */
export interface EventStorePort {
  getStream(streamType: string, streamId: string): Promise<EvDbStream>;
}

/**
 * Creates a CommandAdapter that orchestrates: fetch stream → decide → store → return event.
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
): CommandAdapter<TCommand, EvDbEvent> {
  return async (command: TCommand): Promise<EvDbEvent> => {
    const stream = await eventStore.getStream(
      streamType,
      getStreamId(command),
    ) as TStream;

    handler(stream, command);

    const event = stream.getEvents()[0];
    await stream.store();
    return event;
  };
}
