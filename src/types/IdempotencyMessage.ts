import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";

export function getIdempotencyKey(businessKey: string, consumerId: string): string {
    return `${businessKey}:${consumerId}`;
}

export function createIdempotencyMessageFromEvent(event: EvDbEvent, businessKey: string, consumerId: string): EvDbMessage {
    const idempotencyKey = getIdempotencyKey(businessKey, consumerId);
    return EvDbMessage.createFromEvent(event, { payloadType: `${consumerId}.IdempotencyKeyAddedForConsumer`, idempotencyKey, consumerId }, "idempotent");
}
