
/**
 * Generic command handler type.
 *
 * TCommand — the specific command type (must satisfy Command)
 * TStream  — the concrete stream type (carries typed appendEvent methods)
 *
 * Returns void because side effects (event appending) happen on the stream.
 */
// export type CommandHandler<TCommand, TStreams extends StreamMap> = (command: TCommand, eventStore: EvDbEventStore<TStreams>) => void;
