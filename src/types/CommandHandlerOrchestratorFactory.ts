import type EvDbStream from "@eventualize/core/store/EvDbStream";
import type { CommandHandler, CommandHandlerOrchestrator, CommandHandlerOrchestratorResult } from "./commandHandler.js";
import { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import { IEvDbStreamFactory } from "@eventualize/core/factories/IEvDbStreamFactory";
import IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";
import { EvDbView } from "@eventualize/core/view/EvDbView";
import { StreamWithEventMethods } from "@eventualize/core/factories/EvDbStreamFactory";

/**
 * Minimal interface for the event store dependency.
 * Accepts only what the adapter needs — no coupling to the full EvDbEventStore.
 */
export interface EventStorePort {
  getStream(streamType: string, streamId: string): Promise<EvDbStream>;
}

/**
 * Creates a CommandHandlerOrchestrator that orchestrates:
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
 * @param commandHandler     — pure decision function
 */

export class CommandHandlerOrchestratorFactory {
  static create<
    TCommand,
    TEvents extends IEvDbEventPayload,
    TStreamType extends string,
    TViews extends Record<string, EvDbView<any>> = {},
  >(
    storageAdapter: IEvDbStorageAdapter,
    streamFactory: IEvDbStreamFactory<TEvents, TStreamType, TViews>,
    getStreamId: (command: TCommand) => string,
    commandHandler: CommandHandler<StreamWithEventMethods<TEvents, TViews>, TCommand>,
  ): CommandHandlerOrchestrator<TCommand> {
    async function orchestrate(command: TCommand) {
      const streamId = getStreamId(command);
      const fetchStream = () => {
        return streamFactory.get(
          streamId,
          storageAdapter,
          storageAdapter
        ) as Promise<
            StreamWithEventMethods<TEvents, TViews>
          >;
      };
      const stream = await fetchStream();

      commandHandler(stream, command);

      const events = stream.getEvents();
      if (events.length > 0) {
        await stream.store();
      }

      return { streamId, events };
    }

    return async (command: TCommand): Promise<CommandHandlerOrchestratorResult> => {
      return orchestrate(command);
    };
  }

}
