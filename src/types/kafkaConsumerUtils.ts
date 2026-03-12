import { type Kafka, type Consumer } from "kafkajs";

const RETRY_INTERVAL_MS = 5_000;

/**
 * Shared Kafka consumer infrastructure.
 *
 * Handles the connect → subscribe → run → retry lifecycle that is
 * identical across KafkaConsumerEndpointFactory and ProjectionFactory.
 *
 * Callers provide only the `onMessage` logic specific to their pattern.
 */
export function launchKafkaConsumer(opts: {
  kafka: Kafka;
  groupId: string;
  topics: string[];
  consumers: Consumer[];
  retryTimers: ReturnType<typeof setTimeout>[];
  onMessage: (
    topic: string,
    payload: Record<string, unknown>,
    outboxId: string,
  ) => Promise<void>;
}): void {
  const { kafka, groupId, topics, consumers, retryTimers, onMessage } = opts;

  const attempt = async () => {
    const consumer = kafka.consumer({ groupId });
    await consumer.connect();
    await consumer.subscribe({ topics, fromBeginning: true });

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const outboxId = extractOutboxId(message);
        const payload = parsePayload(message);
        await onMessage(topic, payload, outboxId);
      },
    });

    consumers.push(consumer);
  };

  attempt().catch((err) => {
    console.error(
      `[KafkaConsumer] ${groupId} failed to start, retrying in ${RETRY_INTERVAL_MS / 1000}s:`,
      err.message,
    );
    retryTimers.push(setTimeout(() => attempt(), RETRY_INTERVAL_MS));
  });
}

/** Extracts the outbox ID from a Debezium CDC message.
 *  The Outbox Event Router places the outbox row `id` as a Kafka header.
 */
export function extractOutboxId(message: {
  key: Buffer | null;
  value: Buffer | null;
  headers?: Record<string, unknown>;
}): string {
  if (message.headers) {
    const idHeader = message.headers["id"];
    if (idHeader) {
      return Buffer.isBuffer(idHeader) ? idHeader.toString() : String(idHeader);
    }
  }
  if (message.value) {
    try {
      const parsed = JSON.parse(message.value.toString());
      const value = parsed.payload ?? parsed;
      if (value.outboxId) return value.outboxId;
    } catch { /* fallback below */ }
  }
  if (message.key) {
    try {
      const parsed = JSON.parse(message.key.toString());
      return `${parsed.payload ?? parsed}-${Date.now()}`;
    } catch {
      return `${message.key.toString()}-${Date.now()}`;
    }
  }
  return `unknown-${Date.now()}`;
}

/** Parses the Kafka message value, unwrapping Debezium schema envelopes.
 *  Debezium JsonConverter wraps the outbox payload in a schema envelope:
 *    { "schema": {...}, "payload": "{\"account\":...}" }
 *  The inner payload is a JSON string that needs a second parse.
 */
export function parsePayload(message: { value: Buffer | null }): Record<string, unknown> {
  if (!message.value) return {};
  try {
    const parsed = JSON.parse(message.value.toString());
    const inner = parsed.payload ?? parsed;
    if (typeof inner === "string") {
      return JSON.parse(inner);
    }
    return inner;
  } catch {
    return { raw: message.value.toString() };
  }
}
