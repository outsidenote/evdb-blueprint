import { type Kafka, type Consumer } from "kafkajs";

const RETRY_INTERVAL_MS = 5_000;

export function launchKafkaConsumer(opts: {
  kafka: Kafka;
  groupId: string;
  topics: string[];
  fromBeginning?: boolean;
  consumers: Consumer[];
  retryTimers: ReturnType<typeof setTimeout>[];
  onMessage: (
    topic: string,
    payload: Record<string, unknown>,
    outboxId: string,
  ) => Promise<void>;
}): { stop: () => Promise<void> } {
  const {
    kafka,
    groupId,
    topics,
    fromBeginning = true,
    consumers,
    retryTimers,
    onMessage,
  } = opts;

  let stopped = false;
  let consumer: Consumer | null = null;

  const scheduleRetry = () => {
    if (stopped) return;

    const timer = setTimeout(() => {
      if (!stopped) {
        void attempt();
      }
    }, RETRY_INTERVAL_MS);

    retryTimers.push(timer);
  };

  const attempt = async () => {
    if (stopped) return;

    consumer = kafka.consumer({ groupId });

    // push BEFORE run so shutdown logic knows about it
    consumers.push(consumer);

    try {
      await consumer.connect();
      await consumer.subscribe({ topics, fromBeginning });

      await consumer.run({
        autoCommit: false,
        eachMessage: async ({ topic, partition, message, heartbeat }) => {
          const outboxId = extractOutboxId(message);
          const payload = parsePayload(message);

          await onMessage(topic, payload, outboxId);

          await heartbeat();

          await consumer!.commitOffsets([
            {
              topic,
              partition,
              offset: (BigInt(message.offset) + 1n).toString(),
            },
          ]);
        },
      });

      console.info("[KafkaConsumer] started", { groupId, topics, fromBeginning });
    } catch (err) {
      console.error(
        `[KafkaConsumer] ${groupId} crashed or failed, retrying in ${RETRY_INTERVAL_MS / 1000}s`,
        err,
      );

      try {
        await consumer.disconnect();
      } catch {}

      scheduleRetry();
    }
  };

  void attempt();

  return {
    stop: async () => {
      stopped = true;

      for (const timer of retryTimers) {
        clearTimeout(timer);
      }
      retryTimers.length = 0;

      if (consumer) {
        try {
          await consumer.disconnect();
        } catch (err) {
          console.warn("[KafkaConsumer] disconnect failed", err);
        }
      }
    },
  };
}

/**
 * Extracts outbox ID from Debezium header or payload.
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

      if (value && typeof value === "object" && "outboxId" in value) {
        return String((value as Record<string, unknown>).outboxId);
      }
    } catch {}
  }

  throw new Error(
    "[KafkaConsumer] Cannot extract outboxId — Debezium header 'id' missing and payload has no outboxId.",
  );
}

/**
 * Parses Debezium JSON payload safely.
 */
export function parsePayload(message: {
  value: Buffer | null;
}): Record<string, unknown> {
  if (!message.value) {
    throw new Error("[KafkaConsumer] message value is null");
  }

  try {
    const parsed = JSON.parse(message.value.toString());
    const inner = parsed.payload ?? parsed;

    if (typeof inner === "string") {
      const obj = JSON.parse(inner);
      if (!isRecord(obj)) {
        throw new Error("payload is not an object");
      }
      return obj;
    }

    if (!isRecord(inner)) {
      throw new Error("payload is not an object");
    }

    return inner;
  } catch (err) {
    throw new Error(
      `[KafkaConsumer] payload parse failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}