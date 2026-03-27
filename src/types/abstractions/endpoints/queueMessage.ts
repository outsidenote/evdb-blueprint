import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type { IEvDbPayloadData } from "@eventualize/types/events/IEvDbPayloadData";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";

export function createPgBossQueueMessageFromMetadata(
  queues: string[],
  metadata: IEvDbEventMetadata,
  messageType: string,
  payload: IEvDbPayloadData,
): EvDbMessage {
  const queuePayload = Object.assign({ queues }, payload);
  return EvDbMessage.createFromMetadata(metadata, messageType, queuePayload, "pg-boss");
}
