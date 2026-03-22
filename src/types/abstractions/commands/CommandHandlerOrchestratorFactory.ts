import type { CommandHandler, CommandHandlerOrchestrator, CommandHandlerOrchestratorResult } from "./commandHandler.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { EvDbStreamFactory } from "@eventualize/core/factories/EvDbStreamFactory";
import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";
import type { EvDbView } from "@eventualize/core/view/EvDbView";
import type { StreamWithEventMethods } from "@eventualize/core/factories/EvDbStreamFactory";

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
    TViews extends Record<string, EvDbView<unknown>> = {},
  >(
    storageAdapter: IEvDbStorageAdapter,
    streamFactory: EvDbStreamFactory<TEvents, TStreamType, TViews>,
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
