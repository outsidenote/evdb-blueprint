import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";

export function createPgBossQueueMessageFromEvent(queues: string[], event: EvDbEvent, payload: IEvDbEventPayload): EvDbMessage {
    const queuePayload = Object.assign({ queues }, payload);
    return EvDbMessage.createFromEvent(event, queuePayload, "pg-boss");
}