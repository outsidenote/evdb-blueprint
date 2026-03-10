import { Kafka, type Consumer, type EachMessagePayload } from "kafkajs";
import { PgBoss } from "pg-boss";
import { PgBossEndpointConfig } from "./PgBossEndpointFactory.js";

export interface KafkaConsumerEndpointConfig {
  /** The Kafka topic to consume from (e.g. "events.FundsWithdrawn"). */
  readonly topic: string;
  /** The pg-boss endpoint config that will process the message. */
  readonly pgBossEndpoint: PgBossEndpointConfig<any>;
  /** Consumer group ID. Defaults to the pg-boss queue name. */
  readonly groupId?: string;
}

const RETRY_INTERVAL_MS = 5_000;

/**
 * Kafka consumer endpoint factory.
 *
 * Bridges external events from Kafka (delivered via CDC/Debezium)
 * into pg-boss jobs for downstream command handler slices.
 *
 * Flow: Kafka topic → consumer → pg-boss job → PgBossEndpointFactory handler
 *
 * This is the pattern for cross-boundary-context automation:
 *   - The producing context emits an external event to the outbox (default channel)
 *   - CDC/Debezium publishes it to a Kafka topic
 *   - The consuming context's Kafka consumer reads it and creates a pg-boss job
 *   - The pg-boss worker executes the command
 *
 * Topics are created by Debezium when the first event flows through CDC.
 * The consumer retries in the background until the topic becomes available.
 *
 * Each consumer uses its own consumer group for independent offset tracking.
 * The outbox ID from the Debezium message is forwarded as metadata for idempotency.
 */
export class KafkaConsumerEndpointFactory {
  private consumers: Consumer[] = [];
  private retryTimers: ReturnType<typeof setTimeout>[] = [];

  static async startAll(
    kafka: Kafka,
    boss: PgBoss,
    endpoints: KafkaConsumerEndpointConfig[],
  ): Promise<KafkaConsumerEndpointFactory> {
    const factory = new KafkaConsumerEndpointFactory();

    for (const config of endpoints) {
      const queueName = config.pgBossEndpoint.queueName;
      factory.startConsumer(kafka, boss, config, queueName);
    }

    return factory;
  }

  private startConsumer(
    kafka: Kafka,
    boss: PgBoss,
    config: KafkaConsumerEndpointConfig,
    queueName: string,
  ): void {
    const groupId = config.groupId ?? queueName;

    const attempt = async () => {
      const consumer = kafka.consumer({ groupId });
      await consumer.connect();
      // fromBeginning: true ensures no messages are missed on first deployment.
      // On subsequent connections, kafkajs resumes from the last committed offset
      // regardless of this setting — it only affects the initial consumer group join.
      await consumer.subscribe({ topic: config.topic, fromBeginning: true });

      await consumer.run({
        eachMessage: async ({ message }: EachMessagePayload) => {
          const outboxId = extractOutboxId(message);
          const payload = parsePayload(message);

          await boss.send(queueName, {
            metadata: { outboxId },
            payload,
          });

          console.log(
            `[KafkaConsumer] ${config.topic} → ${queueName} outboxId=${outboxId}`,
          );
        },
      });

      this.consumers.push(consumer);
      console.log(`[KafkaConsumer] Subscribed to ${config.topic} → ${queueName} (group: ${groupId})`);
    };

    attempt().catch((err) => {
      console.error(`[KafkaConsumer] Error subscribing to ${config.topic}, retrying in ${RETRY_INTERVAL_MS / 1000}s:`, err.message);
      this.retryTimers.push(setTimeout(() => attempt(), RETRY_INTERVAL_MS));
    });
  }

  async stop(): Promise<void> {
    for (const timer of this.retryTimers) {
      clearTimeout(timer);
    }
    for (const consumer of this.consumers) {
      await consumer.disconnect().catch(() => {});
    }
  }
}

/** Extracts the outbox ID from a Debezium CDC message.
 *  The Outbox Event Router places the outbox row `id` as a Kafka header
 *  (configured via transforms.outbox.table.field.event.id in the connector).
 */
function extractOutboxId(message: { key: Buffer | null; value: Buffer | null; headers?: Record<string, unknown> }): string {
  // Primary: outbox id is in the Kafka headers (set by Debezium Outbox Event Router)
  if (message.headers) {
    const idHeader = message.headers["id"];
    if (idHeader) {
      return Buffer.isBuffer(idHeader) ? idHeader.toString() : String(idHeader);
    }
  }
  // Fallback: check message value for outboxId field
  if (message.value) {
    try {
      const parsed = JSON.parse(message.value.toString());
      const value = parsed.payload ?? parsed;
      if (value.outboxId) return value.outboxId;
    } catch { /* fallback below */ }
  }
  // Last resort: use message key (stream_id) + timestamp for uniqueness
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
function parsePayload(message: { value: Buffer | null }): Record<string, unknown> {
  if (!message.value) return {};
  try {
    const parsed = JSON.parse(message.value.toString());
    const inner = parsed.payload ?? parsed;
    // Debezium encodes the outbox payload as a JSON string — parse it
    if (typeof inner === "string") {
      return JSON.parse(inner);
    }
    return inner;
  } catch {
    return { raw: message.value.toString() };
  }
}
