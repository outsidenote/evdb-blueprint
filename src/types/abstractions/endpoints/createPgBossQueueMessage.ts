import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type { IEvDbPayloadData } from "@eventualize/types/events/IEvDbPayloadData";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";

/**
 * Creates an {@link EvDbMessage} targeted at one or more pg-boss queues.
 *
 * The function merges the given `queues` array into the payload so the
 * downstream pg-boss consumer knows which queues to enqueue the job on,
 * and sets the message channel to `"pg-boss"`.
 *
 * @param queues - Target pg-boss queue names (e.g. `["calculate-withdraw-commission"]`).
 * @param metadata - Event metadata (stream cursor, event type, captured-at, etc.)
 *   used to derive the message's tracing and ordering fields.
 * @param payload - Arbitrary key/value data forwarded to the queue consumer.
 *   A `queues` property is added to the payload automatically.
 * @param messageType - Logical message type identifier.
 *   Defaults to `metadata.eventType` when omitted.
 * @returns A fully constructed {@link EvDbMessage} on the `"pg-boss"` channel.
 */
export function createPgBossQueueMessage(queues: string[],
    metadata: IEvDbEventMetadata,
    payload: IEvDbPayloadData,
    messageType?: string): EvDbMessage {
    const queuePayload = Object.assign({ queues }, payload);
    return EvDbMessage.createFromMetadata(metadata, messageType ?? metadata.eventType, queuePayload, "pg-boss");
}