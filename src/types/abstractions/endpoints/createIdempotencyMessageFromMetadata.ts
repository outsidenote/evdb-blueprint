import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";

/**
 * Generates a unique idempotency key for the given business key and consumer ID.
 * @param idempotencyKey
 * @param consumerId
 * @returns
 */
export function getIdempotencyKey(idempotencyKey: string, consumerId: string): string {
  return `${idempotencyKey}:${consumerId}`;
}

/**
 * Creates an idempotency message from the given event and keys.
 * @param event
 * @param idempotencyKey
 * @param consumerId
 * @returns
 */
export function createIdempotencyMessageFromMetadata(
  metadata: IEvDbEventMetadata,
  idempotencyKey: string,
  consumerId: string,
): EvDbMessage {
  const key = getIdempotencyKey(idempotencyKey, consumerId);
  return EvDbMessage.createFromMetadata(
    metadata,
    "idempotent",
    {
      payloadType: `${consumerId}.IdempotencyKeyAddedForConsumer`,
      idempotencyKey: key,
      consumerId,
    },
  );
}
