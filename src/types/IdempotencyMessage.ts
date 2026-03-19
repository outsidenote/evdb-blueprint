import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
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
export function createIdempotencyMessageFromEvent(
  event: EvDbEvent,
  idempotencyKey: string,
  consumerId: string,
): EvDbMessage {
  const key = getIdempotencyKey(idempotencyKey, consumerId);
  return EvDbMessage.createFromEvent(
    event,
    {
      payloadType: `${consumerId}.IdempotencyKeyAddedForConsumer`,
      idempotencyKey: key,
      consumerId,
    },
    "idempotent",
  );
}
