import type { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { EvDbView } from "@eventualize/core/view/EvDbView";
import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";
import type EVDbMessagesProducer from "@eventualize/types/messages/EvDbMessagesProducer";

export type EventTypeApplier<TEvent extends IEvDbEventPayload> = <
  TStreamType extends string,
  TEvents extends IEvDbEventPayload = never,
  TViews extends Record<string, EvDbView<unknown>> = {}
>(
  builder: StreamFactoryBuilder<TStreamType, TEvents, TViews>,
) => StreamFactoryBuilder<TStreamType, TEvents | TEvent, TViews>;

export function applyEventType<TEvent extends IEvDbEventPayload>(
  eventType: new (...args: any[]) => TEvent,
  messagesProducer?: EVDbMessagesProducer,
): EventTypeApplier<TEvent> {
  return <TStreamType extends string,
    TEvents extends IEvDbEventPayload = never,
    TViews extends Record<string, EvDbView<unknown>> = {}>(
    builder: StreamFactoryBuilder<TStreamType, TEvents, TViews>,
  ): StreamFactoryBuilder<TStreamType, TEvents | TEvent, TViews> =>
    builder.withEventType(eventType, messagesProducer);
}
